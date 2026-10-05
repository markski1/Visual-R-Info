import { describe, expect, it } from 'vitest';

import { lex } from './lexer.js';
import { TokenKind, TriviaKind } from './token.js';
import type { SourceSpan } from '../source/index.js';

function spans(entries: readonly { span?: SourceSpan }[]) {
	// Offset, línea y columna de inicio y fin.
	return entries.map(({ span }) => {
		if (!span) throw new Error('Falta el rango de fuente.');
		const { start, end } = span;
		return [start.offset, start.line, start.column, end.offset, end.line, end.column];
	});
}

describe('lex', () => {
	it('reconoce operadores, puntuación y literales', () => {
		const result = lex('x := 12 + 3 - 4 * 5 / 6 = 7 <> 8 < 9 <= 10 > 11 >= 12 ~ V & F | Pos(1, 2)');
		expect(result.diagnostics).toEqual([]);
		expect(result.tokens.map(({ kind }) => kind)).toEqual([
			TokenKind.Identifier,
			TokenKind.Assign,
			TokenKind.Integer,
			TokenKind.Plus,
			TokenKind.Integer,
			TokenKind.Minus,
			TokenKind.Integer,
			TokenKind.Star,
			TokenKind.Integer,
			TokenKind.Slash,
			TokenKind.Integer,
			TokenKind.Equal,
			TokenKind.Integer,
			TokenKind.NotEqual,
			TokenKind.Integer,
			TokenKind.Less,
			TokenKind.Integer,
			TokenKind.LessEqual,
			TokenKind.Integer,
			TokenKind.Greater,
			TokenKind.Integer,
			TokenKind.GreaterEqual,
			TokenKind.Integer,
			TokenKind.Not,
			TokenKind.True,
			TokenKind.And,
			TokenKind.False,
			TokenKind.Or,
			TokenKind.SetPosition,
			TokenKind.LeftParenthesis,
			TokenKind.Integer,
			TokenKind.Comma,
			TokenKind.Integer,
			TokenKind.RightParenthesis,
			TokenKind.EndOfFile
		]);
	});

	it('reconoce las palabras reservadas y respeta sus mayúsculas', () => {
		const keywords = [
			['si', TokenKind.If],
			['sino', TokenKind.Else],
			['mientras', TokenKind.While],
			['repetir', TokenKind.Repeat],
			['comenzar', TokenKind.Begin],
			['fin', TokenKind.End],
			['numero', TokenKind.NumberType],
			['boolean', TokenKind.BooleanType],
			['mover', TokenKind.Move],
			['derecha', TokenKind.TurnRight],
			['tomarFlor', TokenKind.TakeFlower],
			['tomarPapel', TokenKind.TakePaper],
			['depositarFlor', TokenKind.DropFlower],
			['depositarPapel', TokenKind.DropPaper],
			['PosAv', TokenKind.PositionAvenue],
			['PosCa', TokenKind.PositionStreet],
			['HayFlorEnLaEsquina', TokenKind.FlowerAtCorner],
			['HayPapelEnLaEsquina', TokenKind.PaperAtCorner],
			['HayFlorEnLaBolsa', TokenKind.FlowerInBag],
			['HayPapelEnLaBolsa', TokenKind.PaperInBag],
			['Informar', TokenKind.Inform],
			['programa', TokenKind.Program],
			['procesos', TokenKind.Processes],
			['proceso', TokenKind.Process],
			['areas', TokenKind.Areas],
			['AreaC', TokenKind.AreaC],
			['AreaP', TokenKind.AreaP],
			['AreaPC', TokenKind.AreaPC],
			['robots', TokenKind.Robots],
			['robot', TokenKind.Robot],
			['variables', TokenKind.Variables],
			['E', TokenKind.InputParameter],
			['S', TokenKind.OutputParameter],
			['ES', TokenKind.InputOutputParameter],
			['AsignarArea', TokenKind.AssignArea],
			['Iniciar', TokenKind.StartRobot],
			['Random', TokenKind.Random],
			['bloquearEsquina', TokenKind.LockCorner],
			['liberarEsquina', TokenKind.UnlockCorner],
			['enviarMensaje', TokenKind.SendMessage],
			['recibirMensaje', TokenKind.ReceiveMessage],
			[':', TokenKind.Colon],
			[';', TokenKind.Semicolon]
		];
		expect(lex(keywords.map(([word]) => word).join(' ')).tokens.map(({ kind }) => kind)).toEqual([
			...keywords.map(([, kind]) => kind),
			TokenKind.EndOfFile
		]);
		expect(
			lex('Si siempre informar constructor toString __proto__').tokens.map(({ kind }) => kind)
		).toEqual([...Array(6).fill(TokenKind.Identifier), TokenKind.EndOfFile]);
	});

	it('conserva trivia y posiciones UTF-16 con comentarios, CRLF y emoji', () => {
		const result = lex('área\r\n\t{uno\n😀}mover');
		expect(result.diagnostics).toEqual([]);
		expect(result.tokens.map(({ kind, lexeme }) => [kind, lexeme])).toEqual([
			[TokenKind.Identifier, 'área'],
			[TokenKind.Move, 'mover'],
			[TokenKind.EndOfFile, '']
		]);
		expect(spans(result.tokens)).toEqual([
			[0, 1, 1, 4, 1, 5],
			[15, 3, 4, 20, 3, 9],
			[20, 3, 9, 20, 3, 9]
		]);
		expect(result.trivia.map(({ kind, lexeme }) => [kind, lexeme])).toEqual([
			[TriviaKind.LineBreak, '\r\n'],
			[TriviaKind.Whitespace, '\t'],
			[TriviaKind.Comment, '{uno\n😀}']
		]);
		expect(spans(result.trivia)).toEqual([
			[4, 1, 5, 6, 2, 1],
			[6, 2, 1, 7, 2, 2],
			[7, 2, 2, 15, 3, 4]
		]);
	});

	it('trata los separadores Unicode como saltos de línea', () => {
		const result = lex('uno\u2028dos\u2029tres');
		expect(result.tokens.map(({ lexeme }) => lexeme)).toEqual(['uno', 'dos', 'tres', '']);
		expect(spans(result.tokens)).toEqual([
			[0, 1, 1, 3, 1, 4],
			[4, 2, 1, 7, 2, 4],
			[8, 3, 1, 12, 3, 5],
			[12, 3, 5, 12, 3, 5]
		]);
		expect(result.trivia.map(({ kind, lexeme }) => [kind, lexeme])).toEqual([
			[TriviaKind.LineBreak, '\u2028'],
			[TriviaKind.LineBreak, '\u2029']
		]);
	});

	it('informa comentarios sin cerrar y conserva el texto', () => {
		const result = lex('{ comentario\nsin cierre');
		expect(result.tokens.map(({ kind }) => kind)).toEqual([TokenKind.EndOfFile]);
		expect(result.trivia.map(({ kind, lexeme }) => [kind, lexeme])).toEqual([
			[TriviaKind.Comment, '{ comentario\nsin cierre']
		]);
		expect(spans(result.trivia)).toEqual([[0, 1, 1, 23, 2, 11]]);
		expect(result.diagnostics).toMatchObject([
			{ code: 'LEX002', phase: 'lexer', severity: 'error' }
		]);
		expect(spans(result.diagnostics)).toEqual([[0, 1, 1, 23, 2, 11]]);
	});

	it('se recupera de símbolos desconocidos sin perder sus rangos', () => {
		const result = lex('@😀} mover');
		expect(result.diagnostics.map(({ code }) => code)).toEqual(['LEX001', 'LEX001', 'LEX001']);
		expect(spans(result.diagnostics)).toEqual([
			[0, 1, 1, 1, 1, 2],
			[1, 1, 2, 3, 1, 4],
			[3, 1, 4, 4, 1, 5]
		]);
		expect(result.tokens.map(({ kind, lexeme }) => [kind, lexeme])).toEqual([
			[TokenKind.Move, 'mover'],
			[TokenKind.EndOfFile, '']
		]);
	});

	it('produce un EOF estable para una fuente vacía', () => {
		const result = lex('');
		expect(result.tokens.map(({ kind, lexeme }) => [kind, lexeme])).toEqual([
			[TokenKind.EndOfFile, '']
		]);
		expect(spans(result.tokens)).toEqual([[0, 1, 1, 0, 1, 1]]);
		expect(result.trivia).toEqual([]);
		expect(result.diagnostics).toEqual([]);
	});
});
