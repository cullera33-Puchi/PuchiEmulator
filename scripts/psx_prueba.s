# Programa de prueba de PlayStation (propio, sin código de Sony). Va como PSX.EXE en un CD de prueba
# que monta scripts/roms_prueba.py; el núcleo lo arranca con su BIOS libre. Pinta toda la pantalla
# (320 x 240) de un color según el mando, que lee él mismo por el puerto serie (SIO0):
# - Azul al arrancar; rojo si la tarjeta de memoria ya tiene la marca (0x5A en el primer byte del
#   bloque 63).
# - Verde con la X (y escribe la marca en la tarjeta de memoria), amarillo con la cruceta a la
#   derecha, magenta con el triángulo y cian con R2.
# Ensamblado con llvm-mc -triple=mipsel -mcpu=mips2, con llamadas relativas (bal) para no tener que
# enlazar. Solo instrucciones de MIPS I, con el hueco
# después de cada salto y de cada carga (el procesador de la PlayStation no espera a la carga).
	.set noreorder
	.set noat
	.text
inicio:
	lui	$s0, 0x1F80            # registros de entrada y salida
	# Imagen: 320 x 240, NTSC, 15 bits
	sw	$zero, 0x1814($s0)     # GP1: reinicio
	lui	$t0, 0x0800
	ori	$t0, $t0, 0x0001
	sw	$t0, 0x1814($s0)       # GP1 08: 320 de ancho, 240 líneas
	lui	$t0, 0x06C6
	ori	$t0, $t0, 0x0260
	sw	$t0, 0x1814($s0)       # GP1 06: margen horizontal
	lui	$t0, 0x0704
	ori	$t0, $t0, 0x0010
	sw	$t0, 0x1814($s0)       # GP1 07: margen vertical
	lui	$t0, 0x0500
	sw	$t0, 0x1814($s0)       # GP1 05: la imagen empieza en (0, 0)
	lui	$t0, 0x0300
	sw	$t0, 0x1814($s0)       # GP1 03: imagen encendida
	lui	$t0, 0xE100
	ori	$t0, $t0, 0x0400
	sw	$t0, 0x1810($s0)       # GP0 E1: se puede dibujar en lo que se ve
	lui	$t0, 0xE300
	sw	$t0, 0x1810($s0)       # GP0 E3: zona de dibujo desde (0, 0)
	lui	$t0, 0xE403
	ori	$t0, $t0, 0xBD3F
	sw	$t0, 0x1810($s0)       # GP0 E4: hasta (319, 239)
	lui	$t0, 0xE500
	sw	$t0, 0x1810($s0)       # GP0 E5: sin desplazamiento

	# Puerto serie: modo 8 bits y velocidad del mando
	li	$t0, 0x000D
	sh	$t0, 0x1048($s0)
	li	$t0, 0x0088
	sh	$t0, 0x104E($s0)

	# ¿Tiene la tarjeta la marca? Lectura del bloque 63: 0x81 'R' 0 0 dirección (00 3F) y luego el
	# quinto byte que llega es el primero de los datos
	bal	seleccionar
	nop
	bal	sio
	li	$a0, 0x81
	bal	sio
	li	$a0, 0x52
	bal	sio
	move	$a0, $zero
	bal	sio
	move	$a0, $zero
	bal	sio
	move	$a0, $zero
	bal	sio
	li	$a0, 0x3F
	li	$s2, 5
leer_marca:
	bal	sio
	move	$a0, $zero
	addiu	$s2, $s2, -1
	bnez	$s2, leer_marca
	nop
	move	$s3, $v0               # primer byte del bloque
	bal	soltar
	nop
	li	$s1, 0xFF0000          # azul (los colores van como BBGGRR)
	li	$t0, 0x5A
	bne	$s3, $t0, bucle
	nop
	li	$s1, 0x0000FF          # rojo: ya estaba la marca

bucle:
	# Un color por imagen, como un juego: espera al barrido vertical (bit 0 de I_STAT) y lo borra
espera:
	lw	$t0, 0x1070($s0)
	nop
	andi	$t0, $t0, 1
	beqz	$t0, espera
	nop
	li	$t0, -2
	sw	$t0, 0x1070($s0)
	bal	leer_mando
	nop
	move	$t9, $s1               # sin botones, el color de arranque
	andi	$t1, $v0, 0x4000       # X
	beqz	$t1, 1f
	nop
	bal	escribir_marca
	nop
	li	$s1, 0x00FF00          # verde, y se queda
	move	$t9, $s1
1:	andi	$t1, $v0, 0x0020       # derecha
	beqz	$t1, 2f
	nop
	li	$t9, 0x00FFFF          # amarillo
2:	andi	$t1, $v0, 0x1000       # triángulo
	beqz	$t1, 3f
	nop
	li	$t9, 0xFF00FF          # magenta
3:	andi	$t1, $v0, 0x0200       # R2
	beqz	$t1, 4f
	nop
	li	$t9, 0xFFFF00          # cian
4:	lui	$t0, 0x0200            # GP0 02: rectángulo relleno
	or	$t0, $t0, $t9
	sw	$t0, 0x1810($s0)
	sw	$zero, 0x1810($s0)     # desde (0, 0)
	lui	$t0, 0x00F0
	ori	$t0, $t0, 0x0140
	sw	$t0, 0x1810($s0)       # 320 x 240
	b	bucle
	nop

# Mando del puerto 1: 0x01 0x42 0 0 0; los dos últimos son los botones (a 0 los pulsados).
# Devuelve en $v0 los pulsados a 1: bits 0 a 7, select, -, -, start, arriba, derecha, abajo,
# izquierda; 8 a 15, L2, R2, L1, R1, triángulo, círculo, X, cuadrado
leer_mando:
	move	$s7, $ra
	bal	seleccionar
	nop
	bal	sio
	li	$a0, 0x01
	bal	sio
	li	$a0, 0x42
	bal	sio
	move	$a0, $zero
	bal	sio
	move	$a0, $zero
	move	$s4, $v0               # botones, parte baja
	bal	sio
	move	$a0, $zero
	sll	$v0, $v0, 8
	or	$v0, $v0, $s4
	nor	$v0, $v0, $zero
	andi	$v0, $v0, 0xFFFF
	move	$s4, $v0
	bal	soltar
	nop
	move	$v0, $s4
	jr	$s7
	nop

# Escribe la marca en el bloque 63 de la tarjeta: 0x81 'W' 0 0 dirección, 128 bytes (0x5A y ceros),
# la suma de control y tres bytes más para recoger la respuesta
escribir_marca:
	move	$s7, $ra
	bal	seleccionar
	nop
	bal	sio
	li	$a0, 0x81
	bal	sio
	li	$a0, 0x57
	bal	sio
	move	$a0, $zero
	bal	sio
	move	$a0, $zero
	bal	sio
	move	$a0, $zero
	bal	sio
	li	$a0, 0x3F
	bal	sio
	li	$a0, 0x5A
	li	$s5, 127
datos:
	bal	sio
	move	$a0, $zero
	addiu	$s5, $s5, -1
	bnez	$s5, datos
	nop
	bal	sio
	li	$a0, 0x65              # suma de control: 0x00 ^ 0x3F ^ 0x5A
	li	$s5, 3
final:
	bal	sio
	move	$a0, $zero
	addiu	$s5, $s5, -1
	bnez	$s5, final
	nop
	bal	soltar
	nop
	jr	$s7
	nop

seleccionar:
	li	$t0, 0x0003            # transmitir y seleccionar el puerto 1
	sh	$t0, 0x104A($s0)
	jr	$ra
	nop

soltar:
	sh	$zero, 0x104A($s0)
	jr	$ra
	nop

# Manda un byte por el puerto serie y devuelve el que llega
sio:
	sb	$a0, 0x1040($s0)
	lbu	$v0, 0x1040($s0)
	jr	$ra
	nop
