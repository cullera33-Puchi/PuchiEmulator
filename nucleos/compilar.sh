#!/usr/bin/env bash
# Compila los núcleos a WebAssembly y los deja en public/nucleos.
#
# Requisitos: Emscripten activado (emcc en el PATH), git, cmake y make.
#   git clone https://github.com/emscripten-core/emsdk.git
#   ./emsdk/emsdk install 4.0.10 && ./emsdk/emsdk activate 4.0.10
#   source ./emsdk/emsdk_env.sh
#
# Uso: nucleos/compilar.sh [mgba]
set -euo pipefail

RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
TRABAJO="${TRABAJO:-$RAIZ/.nucleos}"
SALIDA="$RAIZ/public/nucleos"
mkdir -p "$TRABAJO" "$SALIDA"

# Versiones fijadas. Al subir una, anotarlo en nucleos/README.md y en CHANGELOG.md.
MGBA_REPO="https://github.com/libretro/mgba.git"
MGBA_COMMIT="7a12d6d4b9acb14c0ae62c9166b6a2f3d08007f6"

EXPORTADAS='["_malloc","_free","_pf_iniciar","_pf_cargar","_pf_descargar","_pf_reiniciar","_pf_botones","_pf_fotograma","_pf_video","_pf_video_ancho","_pf_video_alto","_pf_audio","_pf_audio_muestras","_pf_fps","_pf_frecuencia","_pf_base_ancho","_pf_base_alto","_pf_proporcion","_pf_av_cambiado","_pf_memoria","_pf_memoria_tam","_pf_estado_tam","_pf_guardar_estado","_pf_cargar_estado","_pf_opcion"]'

traer() { # repo commit carpeta
	if [ ! -d "$3/.git" ]; then
		git init -q "$3"
		git -C "$3" remote add origin "$1"
	fi
	git -C "$3" fetch -q --depth 1 origin "$2"
	git -C "$3" checkout -q FETCH_HEAD
}

enlazar() { # nombre biblioteca
	emcc -O3 "$RAIZ/nucleos/puente.c" "$2" \
		-I"$RAIZ/nucleos" \
		-o "$SALIDA/$1.js" \
		-sMODULARIZE=1 -sEXPORT_ES6=1 -sEXPORT_NAME=crearNucleo \
		-sENVIRONMENT=web,worker -sALLOW_MEMORY_GROWTH=1 -sINITIAL_MEMORY=67108864 \
		-sSTACK_SIZE=1048576 -sFILESYSTEM=1 -sINVOKE_RUN=0 \
		-sEXPORTED_FUNCTIONS="$EXPORTADAS" \
		-sEXPORTED_RUNTIME_METHODS='["HEAPU8","HEAP16","HEAPU32","stringToNewUTF8"]'
	echo "Listo: public/nucleos/$1.js y $1.wasm ($(du -h "$SALIDA/$1.wasm" | cut -f1))"
}

compilar_mgba() {
	traer "$MGBA_REPO" "$MGBA_COMMIT" "$TRABAJO/mgba"
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
	enlazar mgba "$TRABAJO/mgba_libretro.a"
}

for nucleo in "${@:-mgba}"; do
	"compilar_$nucleo"
done
