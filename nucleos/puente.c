/*
 * Puente entre un núcleo libretro y la app.
 *
 * Es el mismo para todos los núcleos (mGBA hoy, Snes9x en la fase 2): implementa
 * la parte del «frontend» de libretro que necesita la app y expone funciones
 * sencillas que JavaScript llama con ccall o directamente (_pf_*).
 *
 * Todo corre en un solo hilo, sin SharedArrayBuffer, para que funcione en
 * GitHub Pages (que no permite las cabeceras COOP y COEP).
 */
#include <emscripten.h>
#include <stdarg.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "libretro.h"

#define MAX_OPCIONES 64
#define MAX_MUESTRAS 16384 /* pares estéreo por fotograma, con margen */

static uint32_t *video = NULL;   /* RGBA, ancho x alto */
static unsigned videoAncho = 0, videoAlto = 0, videoCapacidad = 0;
static bool videoNuevo = false;
static enum retro_pixel_format formato = RETRO_PIXEL_FORMAT_0RGB1555;

static int16_t audio[MAX_MUESTRAS * 2];
static size_t muestras = 0;

static uint32_t botones = 0;
/* Pantalla táctil (Nintendo DS): coordenadas de libretro, de -0x8000 a 0x7FFF sobre toda la imagen */
static int16_t punteroX = 0, punteroY = 0;
static bool punteroPulsado = false;

static struct retro_system_av_info av;
static bool avCambiado = false;

static char *claves[MAX_OPCIONES];
static char *valores[MAX_OPCIONES];
static int numOpciones = 0;
static bool opcionesCambiadas = false;

static void *juego = NULL;
static char rutaJuego[64];

/* ---- Registro ---- */

static void registro(enum retro_log_level nivel, const char *fmt, ...) {
	if (nivel < RETRO_LOG_WARN) {
		return;
	}
	char texto[512];
	va_list args;
	va_start(args, fmt);
	vsnprintf(texto, sizeof(texto), fmt, args);
	va_end(args);
	fprintf(stderr, "[núcleo] %s", texto);
}

/* ---- Opciones del núcleo ---- */

static const char *buscarOpcion(const char *clave) {
	for (int i = 0; i < numOpciones; ++i) {
		if (strcmp(claves[i], clave) == 0) {
			return valores[i];
		}
	}
	return NULL;
}

EMSCRIPTEN_KEEPALIVE
void pf_opcion(const char *clave, const char *valor) {
	for (int i = 0; i < numOpciones; ++i) {
		if (strcmp(claves[i], clave) == 0) {
			free(valores[i]);
			valores[i] = strdup(valor);
			opcionesCambiadas = true;
			return;
		}
	}
	if (numOpciones < MAX_OPCIONES) {
		claves[numOpciones] = strdup(clave);
		valores[numOpciones] = strdup(valor);
		++numOpciones;
		opcionesCambiadas = true;
	}
}

/* Opción con el formato antiguo «Descripción; valor1|valor2»: si la app no la
 * ha fijado, se toma el primer valor, que es el predeterminado. */
static void opcionPredeterminada(const struct retro_variable *v) {
	if (buscarOpcion(v->key)) {
		return;
	}
	const char *p = strchr(v->value, ';');
	if (!p) {
		return;
	}
	++p;
	while (*p == ' ') {
		++p;
	}
	const char *fin = strchr(p, '|');
	size_t largo = fin ? (size_t) (fin - p) : strlen(p);
	char valor[128];
	if (largo >= sizeof(valor)) {
		largo = sizeof(valor) - 1;
	}
	memcpy(valor, p, largo);
	valor[largo] = '\0';
	pf_opcion(v->key, valor);
}

/* ---- Llamadas del núcleo ---- */

static bool entorno(unsigned cmd, void *datos) {
	switch (cmd) {
	case RETRO_ENVIRONMENT_GET_SYSTEM_DIRECTORY:
	case RETRO_ENVIRONMENT_GET_SAVE_DIRECTORY:
		*(const char **) datos = "/sistema";
		return true;
	case RETRO_ENVIRONMENT_SET_PIXEL_FORMAT: {
		enum retro_pixel_format f = *(const enum retro_pixel_format *) datos;
		if (f == RETRO_PIXEL_FORMAT_RGB565 || f == RETRO_PIXEL_FORMAT_XRGB8888 || f == RETRO_PIXEL_FORMAT_0RGB1555) {
			formato = f;
			return true;
		}
		return false;
	}
	case RETRO_ENVIRONMENT_GET_VARIABLE: {
		struct retro_variable *v = (struct retro_variable *) datos;
		v->value = buscarOpcion(v->key);
		return v->value != NULL;
	}
	case RETRO_ENVIRONMENT_SET_VARIABLES: {
		const struct retro_variable *v = (const struct retro_variable *) datos;
		for (; v && v->key; ++v) {
			opcionPredeterminada(v);
		}
		return true;
	}
	case RETRO_ENVIRONMENT_GET_VARIABLE_UPDATE:
		*(bool *) datos = opcionesCambiadas;
		opcionesCambiadas = false;
		return true;
	case RETRO_ENVIRONMENT_GET_CORE_OPTIONS_VERSION:
		/* 0: el núcleo usa SET_VARIABLES, el formato más sencillo. */
		*(unsigned *) datos = 0;
		return true;
	case RETRO_ENVIRONMENT_GET_LOG_INTERFACE:
		((struct retro_log_callback *) datos)->log = registro;
		return true;
	case RETRO_ENVIRONMENT_GET_CAN_DUPE:
		*(bool *) datos = true;
		return true;
	case RETRO_ENVIRONMENT_GET_INPUT_BITMASKS:
		return true;
	case RETRO_ENVIRONMENT_SET_SYSTEM_AV_INFO:
		av = *(const struct retro_system_av_info *) datos;
		avCambiado = true;
		return true;
	case RETRO_ENVIRONMENT_SET_GEOMETRY:
		av.geometry = *(const struct retro_game_geometry *) datos;
		avCambiado = true;
		return true;
	case RETRO_ENVIRONMENT_SET_INPUT_DESCRIPTORS:
	case RETRO_ENVIRONMENT_SET_MEMORY_MAPS:
	case RETRO_ENVIRONMENT_SET_SUPPORT_ACHIEVEMENTS:
	case RETRO_ENVIRONMENT_SET_CONTROLLER_INFO:
	case RETRO_ENVIRONMENT_SET_SUBSYSTEM_INFO:
	case RETRO_ENVIRONMENT_SET_PERFORMANCE_LEVEL:
		return true;
	default:
		return false;
	}
}

static void asegurarVideo(unsigned ancho, unsigned alto) {
	unsigned necesario = ancho * alto;
	if (necesario > videoCapacidad) {
		free(video);
		video = (uint32_t *) malloc(necesario * sizeof(uint32_t));
		videoCapacidad = necesario;
	}
	videoAncho = ancho;
	videoAlto = alto;
}

/* Convierte el fotograma del núcleo a RGBA (bytes R, G, B, A en memoria). */
static void refrescarVideo(const void *datos, unsigned ancho, unsigned alto, size_t paso) {
	if (!datos) {
		return; /* fotograma repetido */
	}
	asegurarVideo(ancho, alto);
	uint32_t *destino = video;
	if (formato == RETRO_PIXEL_FORMAT_XRGB8888) {
		for (unsigned y = 0; y < alto; ++y) {
			const uint32_t *fila = (const uint32_t *) ((const uint8_t *) datos + y * paso);
			for (unsigned x = 0; x < ancho; ++x) {
				uint32_t p = fila[x];
				*destino++ = 0xFF000000u | ((p & 0xFF) << 16) | (p & 0xFF00) | ((p >> 16) & 0xFF);
			}
		}
	} else if (formato == RETRO_PIXEL_FORMAT_RGB565) {
		for (unsigned y = 0; y < alto; ++y) {
			const uint16_t *fila = (const uint16_t *) ((const uint8_t *) datos + y * paso);
			for (unsigned x = 0; x < ancho; ++x) {
				uint16_t p = fila[x];
				uint32_t r = (p >> 11) & 0x1F, g = (p >> 5) & 0x3F, b = p & 0x1F;
				r = (r << 3) | (r >> 2);
				g = (g << 2) | (g >> 4);
				b = (b << 3) | (b >> 2);
				*destino++ = 0xFF000000u | (b << 16) | (g << 8) | r;
			}
		}
	} else {
		for (unsigned y = 0; y < alto; ++y) {
			const uint16_t *fila = (const uint16_t *) ((const uint8_t *) datos + y * paso);
			for (unsigned x = 0; x < ancho; ++x) {
				uint16_t p = fila[x];
				uint32_t r = (p >> 10) & 0x1F, g = (p >> 5) & 0x1F, b = p & 0x1F;
				r = (r << 3) | (r >> 2);
				g = (g << 3) | (g >> 2);
				b = (b << 3) | (b >> 2);
				*destino++ = 0xFF000000u | (b << 16) | (g << 8) | r;
			}
		}
	}
	videoNuevo = true;
}

static void muestraAudio(int16_t izquierda, int16_t derecha) {
	if (muestras < MAX_MUESTRAS) {
		audio[muestras * 2] = izquierda;
		audio[muestras * 2 + 1] = derecha;
		++muestras;
	}
}

static size_t loteAudio(const int16_t *datos, size_t pares) {
	size_t caben = MAX_MUESTRAS - muestras;
	size_t n = pares < caben ? pares : caben;
	memcpy(&audio[muestras * 2], datos, n * 2 * sizeof(int16_t));
	muestras += n;
	return pares;
}

static void sondearMandos(void) {}

static int16_t estadoMando(unsigned puerto, unsigned dispositivo, unsigned indice, unsigned id) {
	(void) indice;
	if (puerto != 0) {
		return 0;
	}
	if ((dispositivo & RETRO_DEVICE_MASK) == RETRO_DEVICE_POINTER) {
		switch (id) {
		case RETRO_DEVICE_ID_POINTER_X: return punteroX;
		case RETRO_DEVICE_ID_POINTER_Y: return punteroY;
		case RETRO_DEVICE_ID_POINTER_PRESSED: return punteroPulsado ? 1 : 0;
		case RETRO_DEVICE_ID_POINTER_COUNT: return punteroPulsado ? 1 : 0;
		default: return 0;
		}
	}
	if ((dispositivo & RETRO_DEVICE_MASK) != RETRO_DEVICE_JOYPAD) {
		return 0;
	}
	if (id == RETRO_DEVICE_ID_JOYPAD_MASK) {
		return (int16_t) botones;
	}
	return (botones >> id) & 1;
}

/* ---- Funciones para la app ---- */

EMSCRIPTEN_KEEPALIVE
void pf_iniciar(void) {
	retro_set_environment(entorno);
	retro_set_video_refresh(refrescarVideo);
	retro_set_audio_sample(muestraAudio);
	retro_set_audio_sample_batch(loteAudio);
	retro_set_input_poll(sondearMandos);
	retro_set_input_state(estadoMando);
	retro_init();
}

/* Carga una ROM que la app ha copiado en la memoria del módulo. La extensión
 * («gba», «gb», «gbc», «sfc») ayuda a los núcleos que la miran. */
EMSCRIPTEN_KEEPALIVE
bool pf_cargar(void *datos, size_t tam, const char *extension) {
	snprintf(rutaJuego, sizeof(rutaJuego), "/juego.%s", extension);
	struct retro_system_info info;
	memset(&info, 0, sizeof(info));
	retro_get_system_info(&info);

	struct retro_game_info juegoInfo;
	memset(&juegoInfo, 0, sizeof(juegoInfo));
	juegoInfo.path = rutaJuego;
	juegoInfo.data = datos;
	juegoInfo.size = tam;
	juego = datos;

	if (!retro_load_game(&juegoInfo)) {
		return false;
	}
	retro_get_system_av_info(&av);
	avCambiado = true;
	retro_set_controller_port_device(0, RETRO_DEVICE_JOYPAD);
	if (!info.need_fullpath) {
		/* El núcleo ya tiene su copia. */
		free(juego);
		juego = NULL;
	}
	return true;
}

EMSCRIPTEN_KEEPALIVE
void pf_descargar(void) {
	retro_unload_game();
	retro_deinit();
	free(juego);
	juego = NULL;
}

EMSCRIPTEN_KEEPALIVE
void pf_reiniciar(void) {
	retro_reset();
}

EMSCRIPTEN_KEEPALIVE
void pf_botones(uint32_t mascara) {
	botones = mascara;
}

/* Toque en la imagen: x e y de -0x8000 a 0x7FFF; pulsado 0 o 1. */
EMSCRIPTEN_KEEPALIVE
void pf_puntero(int x, int y, int pulsado) {
	punteroX = (int16_t) x;
	punteroY = (int16_t) y;
	punteroPulsado = pulsado != 0;
}

/* Ejecuta un fotograma. Devuelve 1 si hay imagen nueva. */
EMSCRIPTEN_KEEPALIVE
int pf_fotograma(void) {
	muestras = 0;
	videoNuevo = false;
	retro_run();
	return videoNuevo ? 1 : 0;
}

EMSCRIPTEN_KEEPALIVE void *pf_video(void) { return video; }
EMSCRIPTEN_KEEPALIVE unsigned pf_video_ancho(void) { return videoAncho; }
EMSCRIPTEN_KEEPALIVE unsigned pf_video_alto(void) { return videoAlto; }

EMSCRIPTEN_KEEPALIVE void *pf_audio(void) { return audio; }
EMSCRIPTEN_KEEPALIVE size_t pf_audio_muestras(void) { return muestras; }

/* Datos de imagen y sonido que anuncia el núcleo. pf_av_cambiado devuelve 1 una
 * sola vez después de cada cambio. */
EMSCRIPTEN_KEEPALIVE double pf_fps(void) { return av.timing.fps; }
EMSCRIPTEN_KEEPALIVE double pf_frecuencia(void) { return av.timing.sample_rate; }
EMSCRIPTEN_KEEPALIVE unsigned pf_base_ancho(void) { return av.geometry.base_width; }
EMSCRIPTEN_KEEPALIVE unsigned pf_base_alto(void) { return av.geometry.base_height; }
EMSCRIPTEN_KEEPALIVE double pf_proporcion(void) { return av.geometry.aspect_ratio; }
EMSCRIPTEN_KEEPALIVE int pf_av_cambiado(void) {
	int c = avCambiado ? 1 : 0;
	avCambiado = false;
	return c;
}

/* Memoria de la partida guardada (SRAM, Flash o EEPROM) y del reloj del
 * cartucho. id: RETRO_MEMORY_SAVE_RAM (0) o RETRO_MEMORY_RTC (1). */
EMSCRIPTEN_KEEPALIVE void *pf_memoria(unsigned id) { return retro_get_memory_data(id); }
EMSCRIPTEN_KEEPALIVE size_t pf_memoria_tam(unsigned id) { return retro_get_memory_size(id); }

/* Estados guardados. */
EMSCRIPTEN_KEEPALIVE size_t pf_estado_tam(void) { return retro_serialize_size(); }
EMSCRIPTEN_KEEPALIVE bool pf_guardar_estado(void *destino, size_t tam) { return retro_serialize(destino, tam); }
EMSCRIPTEN_KEEPALIVE bool pf_cargar_estado(const void *origen, size_t tam) { return retro_unserialize(origen, tam); }
