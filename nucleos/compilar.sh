#!/usr/bin/env bash
# Compila los núcleos a WebAssembly y los deja en public/nucleos.
#
# Requisitos: Emscripten activado (emcc en el PATH), git, cmake y make.
#   git clone https://github.com/emscripten-core/emsdk.git
#   ./emsdk/emsdk install 4.0.10 && ./emsdk/emsdk activate 4.0.10
#   source ./emsdk/emsdk_env.sh
#
# Uso: nucleos/compilar.sh [mgba] [snes9x] [melonds] [fceumm] [genesis] [n64]
set -euo pipefail

RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
TRABAJO="${TRABAJO:-$RAIZ/.nucleos}"
SALIDA="$RAIZ/public/nucleos"
mkdir -p "$TRABAJO" "$SALIDA"

# Versiones fijadas. Al subir una, anotarlo en nucleos/README.md y en CHANGELOG.md.
MGBA_REPO="https://github.com/libretro/mgba.git"
MGBA_COMMIT="7a12d6d4b9acb14c0ae62c9166b6a2f3d08007f6"
SNES9X_REPO="https://github.com/libretro/snes9x.git"
SNES9X_COMMIT="fae2fea08f74180759ef540ee94259213f503480"
# zlib para las piezas de libretro-common que necesita Snes9x (sin el puerto de Emscripten, que
# se descarga aparte y puede no estar disponible)
MELONDS_REPO="https://github.com/libretro/melonDS.git"
MELONDS_COMMIT="4081e8358e66f1ea11879560be6b813dfeaab75a"
FCEUMM_REPO="https://github.com/libretro/libretro-fceumm.git"
FCEUMM_COMMIT="8997c2bf9503f6d50585b11a1fd7207af53a2426"
GENESIS_REPO="https://github.com/libretro/Genesis-Plus-GX.git"
GENESIS_COMMIT="b9c2316441978d4015ba30e9a95d9b0e6f8ee981"
N64_REPO="https://github.com/libretro/mupen64plus-libretro-nx.git"
N64_COMMIT="15bada85906593376e8fd697f1b0b3af3a20f512"
ZLIB_REPO="https://github.com/madler/zlib.git"
ZLIB_COMMIT="51b7f2abdade71cd9bb0e7a373ef2610ec6f9daf"

# Opciones de compilación que se añaden a todas las llamadas a emcc (también dentro de los Makefile
# de cada núcleo), con EMCC_CFLAGS. Por defecto, SIMD y optimización entre ficheros (v0.27.0, medido
# con npm run rendimiento). Se puede cambiar al llamar: OPTIMIZACION="..." nucleos/compilar.sh
OPTIMIZACION="${OPTIMIZACION--msimd128 -flto}"
export EMCC_CFLAGS="$OPTIMIZACION"

EXPORTADAS='["_malloc","_free","_pf_iniciar","_pf_cargar","_pf_descargar","_pf_reiniciar","_pf_botones","_pf_fotograma","_pf_video","_pf_video_ancho","_pf_video_alto","_pf_audio","_pf_audio_muestras","_pf_fps","_pf_frecuencia","_pf_base_ancho","_pf_base_alto","_pf_proporcion","_pf_av_cambiado","_pf_memoria","_pf_memoria_tam","_pf_estado_tam","_pf_guardar_estado","_pf_cargar_estado","_pf_opcion","_pf_puntero","_pf_analogico","_pf_imagen_gl","_pf_resultado"]'

traer() { # repo commit carpeta
	if [ ! -d "$3/.git" ]; then
		git init -q "$3"
		git -C "$3" remote add origin "$1"
	fi
	git -C "$3" fetch -q --depth 1 origin "$2"
	git -C "$3" checkout -q FETCH_HEAD
}

enlazar() { # nombre enlazador (emcc, o em++ si el núcleo es C++) bibliotecas...
	local nombre="$1" enlazador="$2"
	shift 2
	# El puente se compila siempre como C, para que sus funciones pf_* conserven el nombre.
	# PUENTE_EXTRA y ENLACE_EXTRA: lo que añade un núcleo concreto (Nintendo 64: WebGL y Asyncify)
	emcc -O3 ${PUENTE_EXTRA:-} -c "$RAIZ/nucleos/puente.c" -I"$RAIZ/nucleos" -o "$TRABAJO/puente.o"
	"$enlazador" -O3 "$TRABAJO/puente.o" "$@" \
		-o "$SALIDA/$nombre.js" \
		-sMODULARIZE=1 -sEXPORT_ES6=1 -sEXPORT_NAME=crearNucleo \
		-sENVIRONMENT=web,worker -sALLOW_MEMORY_GROWTH=1 -sINITIAL_MEMORY=67108864 \
		-sSTACK_SIZE=1048576 -sFILESYSTEM=1 -sINVOKE_RUN=0 \
		-sEXPORTED_FUNCTIONS="$EXPORTADAS" \
		-sEXPORTED_RUNTIME_METHODS='["HEAPU8","HEAP16","HEAPU32","stringToNewUTF8","FS","specialHTMLTargets"]' \
		${ENLACE_EXTRA:-}
	echo "Listo: public/nucleos/$nombre.js y $nombre.wasm ($(du -h "$SALIDA/$nombre.wasm" | cut -f1))"
}

compilar_mgba() {
	traer "$MGBA_REPO" "$MGBA_COMMIT" "$TRABAJO/mgba"
	# Desde limpio: si cambian las opciones, Make y CMake no lo detectan
	rm -rf "$TRABAJO/mgba/build-wasm"
	mkdir -p "$TRABAJO/mgba/build-wasm"
	(
		cd "$TRABAJO/mgba/build-wasm"
		emcmake cmake .. -DCMAKE_BUILD_TYPE=Release \
			-DBUILD_LIBRETRO=ON -DLIBRETRO_STATIC=ON -DSKIP_LIBRARY=ON -DDISABLE_DEPS=ON \
			-DBUILD_QT=OFF -DBUILD_SDL=OFF -DBUILD_GL=OFF -DBUILD_GLES2=OFF -DBUILD_GLES3=OFF \
			-DUSE_EPOXY=OFF -DENABLE_DEBUGGERS=OFF -DENABLE_GDB_STUB=OFF -DUSE_EDITLINE=OFF \
			-DENABLE_SCRIPTING=OFF -DUSE_DISCORD_RPC=OFF -DBUILD_SHARED=OFF >/dev/null
		emmake make -j"$(nproc)" mgba_libretro >/dev/null
	)
	# CMake le pone .bc, pero es un archivo estático (.a).
	cp "$TRABAJO/mgba/build-wasm/mgba_libretro.bc" "$TRABAJO/mgba_libretro.a"
	enlazar mgba emcc "$TRABAJO/mgba_libretro.a"
}

compilar_snes9x() {
	traer "$SNES9X_REPO" "$SNES9X_COMMIT" "$TRABAJO/snes9x"
	traer "$ZLIB_REPO" "$ZLIB_COMMIT" "$TRABAJO/zlib"
	(cd "$TRABAJO/snes9x/libretro" && emmake make platform=emscripten clean >/dev/null && emmake make platform=emscripten -j"$(nproc)" >/dev/null)
	cp "$TRABAJO/snes9x/libretro/snes9x_libretro_emscripten.bc" "$TRABAJO/snes9x_libretro.a"

	# En el modo estático, Snes9x espera que la aplicación aporte zlib y las funciones de
	# ficheros de libretro-common (en RetroArch las pone el propio RetroArch)
	local obj="$TRABAJO/snes9x-extra"
	rm -rf "$obj" && mkdir -p "$obj"
	for f in adler32 crc32 deflate infback inffast inflate inftrees trees zutil compress uncompr; do
		emcc -O2 -c "$TRABAJO/zlib/$f.c" -o "$obj/zlib_$f.o"
	done
	local comun="$TRABAJO/snes9x/libretro/libretro-common"
	for f in compat/compat_posix_string.c compat/compat_strcasestr.c compat/compat_snprintf.c \
		compat/compat_strl.c compat/fopen_utf8.c encodings/encoding_utf.c encodings/encoding_deflate.c \
		file/file_path.c file/file_path_io.c streams/file_stream.c streams/file_stream_transforms.c \
		string/stdstring.c time/rtime.c vfs/vfs_implementation.c file/retro_dirent.c; do
		emcc -O2 -c "$comun/$f" -I"$comun/include" -I"$TRABAJO/snes9x/libretro" -I"$TRABAJO/zlib" \
			-DHAVE_ZLIB -o "$obj/$(echo "$f" | tr / _ | sed 's/\.c$/.o/')"
	done
	rm -f "$TRABAJO/snes9x_extra.a"
	emar rcs "$TRABAJO/snes9x_extra.a" "$obj"/*.o
	enlazar snes9x em++ "$TRABAJO/snes9x_libretro.a" "$TRABAJO/snes9x_extra.a"
}

compilar_melonds() {
	traer "$MELONDS_REPO" "$MELONDS_COMMIT" "$TRABAJO/melonds"
	# Sin hilos ni OpenGL: renderizador por software en el hilo del juego. Trae su propia BIOS libre
	(cd "$TRABAJO/melonds" && emmake make platform=emscripten HAVE_THREADS=0 HAVE_OPENGL=0 clean >/dev/null && emmake make platform=emscripten HAVE_THREADS=0 HAVE_OPENGL=0 -j"$(nproc)" >/dev/null)
	# Make lo deja como .bc, pero es un objeto WebAssembly ya enlazado
	cp "$TRABAJO/melonds/melonds_libretro_emscripten.bc" "$TRABAJO/melonds_libretro.o"
	enlazar melonds em++ "$TRABAJO/melonds_libretro.o"
}

compilar_fceumm() {
	# Sin -flto: en FCEUmm duplica el tamaño (de 1,1 a 2,3 MB) sin ganar velocidad (v0.27.0)
	local EMCC_CFLAGS="${OPTIMIZACION//-flto/}"
	export EMCC_CFLAGS
	traer "$FCEUMM_REPO" "$FCEUMM_COMMIT" "$TRABAJO/fceumm"
	(cd "$TRABAJO/fceumm" && emmake make platform=emscripten clean >/dev/null && emmake make platform=emscripten -j"$(nproc)" >/dev/null)
	local salida
	salida="$(ls "$TRABAJO/fceumm"/fceumm_libretro_emscripten.* | head -1)"
	cp "$salida" "$TRABAJO/fceumm_libretro.a"
	# Como Snes9x, en modo estático espera las funciones de ficheros de libretro-common
	local obj="$TRABAJO/fceumm-extra"
	rm -rf "$obj" && mkdir -p "$obj"
	local comun="$TRABAJO/fceumm/src/drivers/libretro/libretro-common"
	for f in compat/compat_strl.c compat/compat_posix_string.c compat/compat_strcasestr.c compat/fopen_utf8.c \
		encodings/encoding_utf.c file/file_path.c file/file_path_io.c streams/file_stream.c \
		string/stdstring.c time/rtime.c vfs/vfs_implementation.c; do
		[ -f "$comun/$f" ] || continue
		emcc -O2 -c "$comun/$f" -I"$comun/include" -o "$obj/$(echo "$f" | tr / _ | sed 's/\.c$/.o/')"
	done
	rm -f "$TRABAJO/fceumm_extra.a"
	emar rcs "$TRABAJO/fceumm_extra.a" "$obj"/*.o
	enlazar fceumm emcc "$TRABAJO/fceumm_libretro.a" "$TRABAJO/fceumm_extra.a"
}

compilar_genesis() {
	traer "$GENESIS_REPO" "$GENESIS_COMMIT" "$TRABAJO/genesis"
	(cd "$TRABAJO/genesis" && emmake make -f Makefile.libretro platform=emscripten clean >/dev/null && emmake make -f Makefile.libretro platform=emscripten -j"$(nproc)" >/dev/null)
	local salida
	salida="$(ls "$TRABAJO/genesis"/genesis_plus_gx_libretro_emscripten.* | head -1)"
	cp "$salida" "$TRABAJO/genesis_libretro.a"
	# Las funciones de ficheros de libretro-common (rfopen y compañía), de su propia copia
	local obj="$TRABAJO/genesis-extra"
	rm -rf "$obj" && mkdir -p "$obj"
	local comun="$TRABAJO/genesis/libretro/libretro-common"
	for f in compat/compat_strl.c compat/compat_posix_string.c compat/compat_strcasestr.c compat/fopen_utf8.c \
		encodings/encoding_utf.c file/file_path.c file/file_path_io.c streams/file_stream.c \
		streams/file_stream_transforms.c string/stdstring.c time/rtime.c vfs/vfs_implementation.c; do
		[ -f "$comun/$f" ] || continue
		emcc -O2 -c "$comun/$f" -I"$comun/include" -o "$obj/$(echo "$f" | tr / _ | sed 's/\.c$/.o/')"
	done
	rm -f "$TRABAJO/genesis_extra.a"
	emar rcs "$TRABAJO/genesis_extra.a" "$obj"/*.o
	enlazar genesis emcc "$TRABAJO/genesis_libretro.a" "$TRABAJO/genesis_extra.a"
}

compilar_n64() {
	# Nintendo 64 (v0.32.0): Mupen64Plus-Next con GLideN64 (OpenGL ES 3, que en el navegador es WebGL 2;
	# GLES3=1 manda sobre el «GLES := 1» de su Makefile para Emscripten, que lo dejaba en OpenGL ES 2)
	# y el intérprete con caché (en WebAssembly no hay recompilador).
	# Sin -flto (aún sin medir) y con -fno-common: su Makefile pone -fcommon, y en WebAssembly las variables
	# globales sin valor inicial quedan entonces sin definir (g_dev, retro_thread)
	local EMCC_CFLAGS="${OPTIMIZACION//-flto/} -fno-common"
	export EMCC_CFLAGS
	traer "$N64_REPO" "$N64_COMMIT" "$TRABAJO/n64"
	traer "$ZLIB_REPO" "$ZLIB_COMMIT" "$TRABAJO/zlib"
	# Su Makefile pide el zlib de los «ports» de Emscripten, que se descarga aparte: se usa el nuestro.
	# xxHash, con SIMD de WebAssembly, carga una capa de NEON que no compila en C++: va sin ella
	(cd "$TRABAJO/n64" && emmake make platform=emscripten GLES3=1 clean >/dev/null &&
		emmake make platform=emscripten GLES3=1 CPUFLAGS="-DEMSCRIPTEN -DNO_ASM -D\"XXH_HAS_INCLUDE(x)=0\" -I$TRABAJO/zlib" -j"$(nproc)" >/dev/null)
	# Todas las piezas menos su libco (para WebAssembly no tiene; va la nuestra, con fibras de Emscripten).
	# Sueltas y no en una biblioteca: compila con -fcommon y el enlazador no saca de una biblioteca las
	# variables globales sin valor inicial (g_dev, las funciones de GL de glsym)
	(cd "$TRABAJO/n64" && find "$TRABAJO/n64" -name '*.o' ! -path '*/libretro-common/libco/*' | sort > "$TRABAJO/n64.piezas")
	emcc -O3 -c "$RAIZ/nucleos/libco_emscripten.c" -I"$TRABAJO/n64/libretro-common/include" -o "$TRABAJO/libco_emscripten.o"
	PUENTE_EXTRA="-DPF_GL" \
		ENLACE_EXTRA="-sINITIAL_MEMORY=134217728 -sASYNCIFY -sASYNCIFY_STACK_SIZE=65536 -sMIN_WEBGL_VERSION=2 -sMAX_WEBGL_VERSION=2 -sFULL_ES3 -sGL_ENABLE_GET_PROC_ADDRESS" \
		enlazar n64 em++ "@$TRABAJO/n64.piezas" "$TRABAJO/libco_emscripten.o"
}

for nucleo in ${@:-mgba snes9x melonds fceumm genesis}; do
	"compilar_$nucleo"
done
