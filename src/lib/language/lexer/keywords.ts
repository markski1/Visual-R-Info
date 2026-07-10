import { TokenKind, type TokenKind as TokenKindType } from './token.js';

const KEYWORDS: Readonly<Record<string, TokenKindType>> = {
	programa: TokenKind.Program,
	procesos: TokenKind.Processes,
	proceso: TokenKind.Process,
	areas: TokenKind.Areas,
	AreaC: TokenKind.AreaC,
	AreaP: TokenKind.AreaP,
	AreaPC: TokenKind.AreaPC,
	robots: TokenKind.Robots,
	robot: TokenKind.Robot,
	variables: TokenKind.Variables,
	E: TokenKind.InputParameter,
	S: TokenKind.OutputParameter,
	ES: TokenKind.InputOutputParameter,
	si: TokenKind.If,
	sino: TokenKind.Else,
	mientras: TokenKind.While,
	repetir: TokenKind.Repeat,
	comenzar: TokenKind.Begin,
	fin: TokenKind.End,
	numero: TokenKind.NumberType,
	boolean: TokenKind.BooleanType,
	V: TokenKind.True,
	F: TokenKind.False,
	mover: TokenKind.Move,
	derecha: TokenKind.TurnRight,
	tomarFlor: TokenKind.TakeFlower,
	tomarPapel: TokenKind.TakePaper,
	depositarFlor: TokenKind.DropFlower,
	depositarPapel: TokenKind.DropPaper,
	PosAv: TokenKind.PositionAvenue,
	PosCa: TokenKind.PositionStreet,
	Pos: TokenKind.SetPosition,
	HayFlorEnLaEsquina: TokenKind.FlowerAtCorner,
	HayPapelEnLaEsquina: TokenKind.PaperAtCorner,
	HayFlorEnLaBolsa: TokenKind.FlowerInBag,
	HayPapelEnLaBolsa: TokenKind.PaperInBag,
	Informar: TokenKind.Inform,
	AsignarArea: TokenKind.AssignArea,
	Iniciar: TokenKind.StartRobot,
	// Primitivas del entorno CMRE (Concurrent Multi Robot Environment).
	Random: TokenKind.Random,
	bloquearEsquina: TokenKind.LockCorner,
	liberarEsquina: TokenKind.UnlockCorner,
	enviarMensaje: TokenKind.SendMessage,
	recibirMensaje: TokenKind.ReceiveMessage
};

export function keywordKind(lexeme: string): TokenKindType | undefined {
	return KEYWORDS[lexeme];
}
