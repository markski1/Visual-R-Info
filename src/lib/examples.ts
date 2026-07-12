export interface ExampleProgram {
	readonly id: string;
	readonly name: string;
	readonly description: string;
	readonly source: string;
}

export const EXAMPLE_PROGRAMS: readonly ExampleProgram[] = [
	{
		id: 'recorrido',
		name: 'Recorrido básico',
		description: 'Un robot recorre un cuadrado y muestra el uso de repetir, variables e Informar.',
		source: `programa recorrido
areas
  ciudad: AreaC(1,1,100,100)
robots
  robot explorador
  variables
    lado: numero
  comenzar
    lado:=0
    repetir 4
      repetir 4
        mover
      derecha
      lado:=lado+1
    Informar(lado)
  fin
variables
  Rinfo: explorador
comenzar
  AsignarArea(Rinfo,ciudad)
  Iniciar(Rinfo,10,10)
fin`
	},
	{
		id: 'areas',
		name: 'Múltiples áreas',
		description: 'Dos robots recorren áreas privadas diferentes y permiten comparar sus estados.',
		source: `programa areasSeparadas
areas
  corredorIzquierdo: AreaP(10,10,15,15)
  corredorDerecho: AreaP(20,10,25,15)
robots
  robot caminante
  comenzar
    repetir 4
      repetir 5
        mover
      derecha
    Informar(PosAv,PosCa)
  fin
variables
  R1: caminante
  R2: caminante
comenzar
  AsignarArea(R1,corredorIzquierdo)
  AsignarArea(R2,corredorDerecho)
  Iniciar(R1,10,10)
  Iniciar(R2,20,10)
fin`
	},
	{
		id: 'multiples_robots',
		name: 'Múltiples robots',
		description: 'Cinco robots dibujan la palabra R-Info al mismo tiempo.',
		source: `programa comunicacion
    procesos
      proceso izquierda()
        comenzar
          repetir 3
            derecha
        fin
      proceso media_vuelta()
        comenzar
          repetir 2
            derecha
        fin
    areas
      compartida: AreaC(1,1,100,100)
    robots
      robot robotR
      comenzar
        repetir 8
          mover
        derecha
        repetir 3
          repetir 4
            mover
          derecha
        derecha
        mover
        repetir 3
          derecha
          mover
          izquierda
          mover
        derecha
        mover
      fin
      robot robot_guion
      comenzar
        derecha
        repetir 3
          mover
      fin
      robot robotI
      variables
        recibido: numero
      comenzar
        repetir 8
          mover
      fin
      robot robotN
      variables
        recibido: numero
      comenzar
        repetir 8
          mover
        derecha
        mover
        repetir 4
          derecha
          repetir 2
            mover
          izquierda
          mover
        izquierda
        repetir 8
          mover
      fin
      robot robotF
      comenzar
        repetir 8
          mover
        derecha
        repetir 4
          mover
        media_vuelta
        repetir 4
          mover
        izquierda
        repetir 3
          mover
        izquierda
        repetir 4
          mover
      fin
      robot robotO
      comenzar
        repetir 8
          mover
        derecha
        repetir 4
          mover
        derecha
        repetir 8
          mover
        derecha
        repetir 4
          mover
      fin
    variables
      R: robotR
      RG: robot_guion
      I: robotI
      N: robotN
      FF: robotF
      O: robotO
    comenzar
      AsignarArea(R,compartida)
      AsignarArea(RG,compartida)
      AsignarArea(I,compartida)
      AsignarArea(N,compartida)
      AsignarArea(FF,compartida)
      AsignarArea(O,compartida)
      Iniciar(R,10,35)
      Iniciar(RG,16,39)
      Iniciar(I, 21, 35)
      Iniciar(N,23,35)
      Iniciar(FF,30,35)
      Iniciar(O,36,35)
    fin`
	},
	{
		id: 'cmre',
		name: 'Concurrencia multirrobot',
		description:
			'Dos robots se coordinan por mensaje y recorren simultáneamente un área compartida.',
		source: `programa cmre
areas
  compartida: AreaC(1,1,100,100)
robots
  robot emisor
  variables
    valor: numero
  comenzar
    valor:=42
    enviarMensaje(valor,R2)
		repetir 6
		  mover
		derecha
		repetir 6
		  mover
		Informar(valor)
  fin
  robot receptor
  variables
    recibido: numero
  comenzar
    recibirMensaje(recibido,R1)
		repetir 4
		  mover
		derecha
		repetir 8
		  mover
    Informar(recibido)
  fin
variables
  R1: emisor
  R2: receptor
comenzar
  AsignarArea(R1,compartida)
  AsignarArea(R2,compartida)
	Iniciar(R1,15,15)
	Iniciar(R2,25,15)
fin`
	},
	{
		id: 'procesos',
		name: 'Procesos y control',
		description: 'Un proceso con parámetro ES combina repetición, asignación y giro.',
		source: `programa usoProcesos
procesos
  proceso avanzarYGirar(ES pasos: numero)
  comenzar
    repetir 3
      mover
      pasos:=pasos+1
    derecha
  fin
  proceso izquierda()
  comenzar
    repetir 3
      derecha
  fin
areas
  ciudad: AreaC(1,1,100,100)
robots
  robot explorador
  variables
    pasos: numero
  comenzar
    pasos:=0
    repetir 4
      repetir 4
        avanzarYGirar(pasos)
      izquierda()
    Informar(pasos)
  fin
variables
  Rinfo: explorador
comenzar
  AsignarArea(Rinfo,ciudad)
  Iniciar(Rinfo,10,10)
fin`
	}
] as const;

export const DEFAULT_EXAMPLE = EXAMPLE_PROGRAMS[0];
