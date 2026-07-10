import { TokenKind, type TokenKind as TokenKindType } from './token.js';

const KEYWORDS: Readonly<Record<string, TokenKindType>> = {
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
	Informar: TokenKind.Inform
};

export function keywordKind(lexeme: string): TokenKindType | undefined {
	return KEYWORDS[lexeme];
}
