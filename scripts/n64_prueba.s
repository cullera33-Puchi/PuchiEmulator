# ROM de prueba de Nintendo 64 (propia, sin código de Nintendo). Se ejecuta desde 0xA4000040, donde el
# arranque simulado del emulador copia los 4 KB que siguen a la cabecera (el sitio del IPL3).
# Pantalla de 320 x 240 a 16 bits en 0x00100000: azul al arrancar, verde al pulsar A (y deja 0x5A en el
# bloque 0 de la EEPROM) y rojo al arrancar si la EEPROM ya tenía la marca. Con la palanca a la derecha,
# amarillo; con un botón C, magenta (v0.32.0, para comprobar la palanca y los botones C de la app).
# Con B (v0.34.0), una lista de órdenes para el procesador de imagen (RDP), que dibuja la tarjeta gráfica
# por GLideN64: rectángulo rojo de (10, 10) a (300, 230) y encima un triángulo cian con el vértice
# arriba (160, 40) y la base de (60, 200) a (260, 200). Sirve para comprobar cómo dibuja GLideN64.
	.set noreorder
	.set noat
	.text
inicio:
	lui	$t0, 0xA440            # VI
	li	$t1, 0x0000320E
	sw	$t1, 0x00($t0)         # 16 bits
	lui	$t1, 0x0010
	sw	$t1, 0x04($t0)         # imagen en 0x00100000
	li	$t1, 320
	sw	$t1, 0x08($t0)
	li	$t1, 2
	sw	$t1, 0x0C($t0)
	li	$t1, 0x03E52239
	sw	$t1, 0x14($t0)
	li	$t1, 0x0000020D
	sw	$t1, 0x18($t0)
	li	$t1, 0x00000C15
	sw	$t1, 0x1C($t0)
	li	$t1, 0x0C150C15
	sw	$t1, 0x20($t0)
	li	$t1, 0x006C02EC
	sw	$t1, 0x24($t0)
	li	$t1, 0x002501FF
	sw	$t1, 0x28($t0)
	li	$t1, 0x000E0204
	sw	$t1, 0x2C($t0)
	li	$t1, 0x00000200
	sw	$t1, 0x30($t0)
	li	$t1, 0x00000400
	sw	$t1, 0x34($t0)

	# Lee el bloque 0 de la EEPROM: canales 0 a 3 sin nada, canal 4: enviar 2 (leer, bloque 0), recibir 8
	lui	$a0, 0xA020            # bloque de la PIF en 0x00200000
	sw	$zero, 0x00($a0)
	li	$t1, 0x02080400
	sw	$t1, 0x04($a0)
	li	$t1, -1
	sw	$t1, 0x08($a0)
	sw	$t1, 0x0C($a0)
	lui	$t1, 0xFE00
	sw	$t1, 0x10($a0)
	bal	vaciar
	nop
	bal	pif
	nop
	lw	$t1, 0x08($a0)
	srl	$t1, $t1, 24
	li	$t2, 0x5A
	li	$s0, 0x003F            # azul (RGBA 5551)
	bne	$t1, $t2, pintar
	nop
	li	$s0, 0xF801            # rojo: ya había partida
pintar:
	bal	llenar
	nop
	move	$s1, $zero             # aún no se ha pulsado A
	move	$s2, $zero             # aún no se ha dibujado con el RDP

bucle:
	# Mando 1: FF (nada), enviar 1, recibir 4, orden 1 (botones)
	lui	$a0, 0xA020
	li	$t1, 0xFF010401
	sw	$t1, 0x00($a0)
	li	$t1, -1
	sw	$t1, 0x04($a0)
	lui	$t1, 0xFE00
	sw	$t1, 0x08($a0)
	sw	$zero, 0x0C($a0)
	sw	$zero, 0x10($a0)
	bal	vaciar_desde_14
	nop
	bal	pif
	nop
	lw	$t7, 0x04($a0)         # botones (2 bytes), palanca x e y
	# Palanca a la derecha (x mayor que 40): amarillo
	sll	$t8, $t7, 16
	sra	$t8, $t8, 24
	slti	$t8, $t8, 41
	bne	$t8, $zero, 3f
	nop
	li	$t9, 0xFFC1
	b	4f
	nop
	# Algún botón C (los cuatro bits bajos del segundo byte): magenta
3:	lui	$t8, 0x000F
	and	$t8, $t7, $t8
	beq	$t8, $zero, 5f
	nop
	li	$t9, 0xF83F
4:	beq	$t9, $s0, 5f
	nop
	move	$s0, $t9
	bal	llenar
	nop
5:	lui	$t8, 0x4000            # B: dibujo con el RDP, una vez
	and	$t8, $t7, $t8
	beq	$t8, $zero, 6f
	nop
	bne	$s2, $zero, 6f
	nop
	li	$s2, 1
	bal	dibujar_rdp
	nop
6:	lui	$t2, 0x8000            # A
	and	$t1, $t7, $t2
	beq	$t1, $zero, bucle
	nop
	bne	$s1, $zero, bucle
	nop
	li	$s1, 1
	li	$s0, 0x07C1            # verde
	bal	llenar
	nop
	# Escribe la marca: canal 4, enviar 10 (escribir, bloque 0, 8 datos), recibir 1
	lui	$a0, 0xA020
	sw	$zero, 0x00($a0)
	li	$t1, 0x0A010500
	sw	$t1, 0x04($a0)
	lui	$t1, 0x5A00
	sw	$t1, 0x08($a0)
	sw	$zero, 0x0C($a0)
	li	$t1, 0xFFFE0000
	sw	$t1, 0x10($a0)
	bal	vaciar_desde_14
	nop
	bal	pif
	nop
	b	bucle
	nop

# Escribe la lista de órdenes del RDP en 0x00200100 y la manda (registros DPC_START y DPC_END)
dibujar_rdp:
	lui	$a1, 0xA020
	ori	$a1, $a1, 0x0100
	li	$t1, 0xFF10013F        # imagen de color: RGBA de 16 bits, 320 de ancho
	sw	$t1, 0x00($a1)
	lui	$t1, 0x0010            # en 0x00100000, la misma que enseña el VI
	sw	$t1, 0x04($a1)
	li	$t1, 0xED000000        # recorte: toda la imagen
	sw	$t1, 0x08($a1)
	li	$t1, 0x005003C0
	sw	$t1, 0x0C($a1)
	li	$t1, 0xEF300000        # modo de relleno
	sw	$t1, 0x10($a1)
	sw	$zero, 0x14($a1)
	li	$t1, 0xF7000000        # color de relleno: rojo
	sw	$t1, 0x18($a1)
	li	$t1, 0xF801F801
	sw	$t1, 0x1C($a1)
	li	$t1, 0xF64B0398        # rectángulo de (10, 10) a (300, 230)
	sw	$t1, 0x20($a1)
	li	$t1, 0x00028028
	sw	$t1, 0x24($a1)
	li	$t1, 0xEF000000        # modo de un ciclo, sin mezcla
	sw	$t1, 0x28($a1)
	sw	$zero, 0x2C($a1)
	li	$t1, 0xFCFFFFFF        # combinador: el color primitivo
	sw	$t1, 0x30($a1)
	li	$t1, 0xFFFDF6FB
	sw	$t1, 0x34($a1)
	li	$t1, 0xFA000000        # color primitivo: cian
	sw	$t1, 0x38($a1)
	li	$t1, 0x00FFFFFF
	sw	$t1, 0x3C($a1)
	li	$t1, 0xC8800320        # triángulo sin sombreado, lado mayor a la izquierda; y abajo 200
	sw	$t1, 0x40($a1)
	li	$t1, 0x032000A0        # y media 200, y arriba 40
	sw	$t1, 0x44($a1)
	li	$t1, 0x01040000        # XL 260, pendiente 0
	sw	$t1, 0x48($a1)
	sw	$zero, 0x4C($a1)
	li	$t1, 0x00A00000        # XH 160, pendiente -0,625
	sw	$t1, 0x50($a1)
	li	$t1, 0xFFFF6000
	sw	$t1, 0x54($a1)
	li	$t1, 0x00A00000        # XM 160, pendiente 0,625
	sw	$t1, 0x58($a1)
	li	$t1, 0x0000A000
	sw	$t1, 0x5C($a1)
	li	$t1, 0xE9000000        # sincronización final
	sw	$t1, 0x60($a1)
	sw	$zero, 0x64($a1)
	lui	$t5, 0xA410            # DPC
	lui	$t1, 0x0020
	ori	$t1, $t1, 0x0100
	sw	$t1, 0x00($t5)         # inicio
	ori	$t1, $t1, 0x0168
	sw	$t1, 0x04($t5)         # fin: la lista se procesa
	jr	$ra
	nop

# Pone a cero las palabras 5 a 14 del bloque y el 1 de «procesar» en la 15
vaciar:
vaciar_desde_14:
	addiu	$t3, $a0, 0x14
	addiu	$t4, $a0, 0x3C
1:	sw	$zero, 0($t3)
	addiu	$t3, $t3, 4
	bne	$t3, $t4, 1b
	nop
	li	$t1, 1
	sw	$t1, 0x3C($a0)
	jr	$ra
	nop

# Manda el bloque a la PIF y lee la respuesta (SI: DMA de 64 bytes en cada sentido)
pif:
	lui	$t5, 0xA480
	lui	$t1, 0x0020
	sw	$t1, 0x00($t5)
	li	$t1, 0x1FC007C0
	sw	$t1, 0x10($t5)         # escribir en la PIF
1:	lw	$t1, 0x18($t5)
	andi	$t1, $t1, 3
	bne	$t1, $zero, 1b
	nop
	lui	$t1, 0x0020
	sw	$t1, 0x00($t5)
	li	$t1, 0x1FC007C0
	sw	$t1, 0x04($t5)         # leer de la PIF
2:	lw	$t1, 0x18($t5)
	andi	$t1, $t1, 3
	bne	$t1, $zero, 2b
	nop
	jr	$ra
	nop

# Llena la imagen (320 x 240 a 16 bits) con el color de $s0
llenar:
	sll	$t1, $s0, 16
	or	$t1, $t1, $s0
	lui	$t3, 0xA010
	lui	$t4, 0xA012
	ori	$t4, $t4, 0x5800       # 0xA0100000 + 153600
1:	sw	$t1, 0($t3)
	addiu	$t3, $t3, 4
	bne	$t3, $t4, 1b
	nop
	jr	$ra
	nop
