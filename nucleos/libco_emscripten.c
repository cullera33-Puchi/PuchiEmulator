/*
 * libco con las fibras de Emscripten (Asyncify), para Mupen64Plus-Next (v0.32.0).
 *
 * El núcleo de Nintendo 64 ejecuta la consola en una corrutina (`co_switch`) y cede el control una
 * vez por fotograma. libretro-common no trae versión para WebAssembly (caería en sjlj.c, que necesita
 * cambiar de pila con longjmp y no funciona). Esta usa emscripten_fiber_*: hay que enlazar con
 * -sASYNCIFY.
 */
#include <emscripten/fiber.h>
#include <stdlib.h>
#include <libco.h>

typedef struct {
	emscripten_fiber_t fibra;
	void *pila_c;
	void *pila_asyncify;
	void (*entrada)(void);
} hilo_co;

#define PILA_ASYNCIFY (1024 * 1024)

static hilo_co principal;
static int principal_listo = 0;
static hilo_co *activo = NULL;

static void arrancar(void *arg) {
	hilo_co *h = (hilo_co *)arg;
	/*
	 * Mupen64Plus-Next registra EmuThreadFunction, que es «void *f(void *)», como «void f(void)». En
	 * WebAssembly la llamada indirecta tiene que coincidir con el tipo real o el programa se para
	 * («function signature mismatch»): se llama con su tipo. La otra corrutina del núcleo (la del dibujo
	 * en otro hilo) no se usa: va desactivada.
	 */
	((void *(*)(void *))h->entrada)(NULL);
	/*
	 * Al parar el juego (retro_deinit), la corrutina del núcleo termina y vuelve aquí. En libco eso no
	 * debería pasar; se devuelve el control al hilo principal y esta corrutina ya no se usa.
	 */
	for (;;) co_switch((cothread_t)&principal);
}

cothread_t co_active(void) {
	if (!principal_listo) {
		principal.pila_asyncify = malloc(PILA_ASYNCIFY);
		emscripten_fiber_init_from_current_context(&principal.fibra, principal.pila_asyncify, PILA_ASYNCIFY);
		principal_listo = 1;
		activo = &principal;
	}
	return (cothread_t)activo;
}

cothread_t co_create(unsigned int tam, void (*entrada)(void)) {
	co_active();
	hilo_co *h = (hilo_co *)calloc(1, sizeof(hilo_co));
	if (!h) return NULL;
	if (tam < 256 * 1024) tam = 256 * 1024;
	h->pila_c = malloc(tam);
	h->pila_asyncify = malloc(PILA_ASYNCIFY);
	h->entrada = entrada;
	if (!h->pila_c || !h->pila_asyncify) {
		free(h->pila_c);
		free(h->pila_asyncify);
		free(h);
		return NULL;
	}
	emscripten_fiber_init(&h->fibra, arrancar, h, h->pila_c, tam, h->pila_asyncify, PILA_ASYNCIFY);
	return (cothread_t)h;
}

void co_delete(cothread_t t) {
	hilo_co *h = (hilo_co *)t;
	if (!h || h == &principal) return;
	free(h->pila_c);
	free(h->pila_asyncify);
	free(h);
}

void co_switch(cothread_t t) {
	hilo_co *antes = activo;
	hilo_co *despues = (hilo_co *)t;
	if (antes == despues) return;
	activo = despues;
	emscripten_fiber_swap(&antes->fibra, &despues->fibra);
}

int co_serializable(void) {
	return 0;
}

/*
 * GLideN64 enlaza su modo de dibujo en otro hilo (ThreadedOpenGl), que pide sem_timedwait. En la app
 * ese modo va desactivado (mupen64plus-ThreadedRenderer = False) y Emscripten sin hilos no la trae:
 * nunca se llama, pero tiene que existir para enlazar.
 */
#include <errno.h>
#include <semaphore.h>
#include <time.h>

int sem_timedwait(sem_t *s, const struct timespec *t) {
	(void) s;
	(void) t;
	errno = ETIMEDOUT;
	return -1;
}
