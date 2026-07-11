import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

import { lex } from './lexer.js';
import { TokenKind, TriviaKind } from './token.js';

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

	it('reconoce únicamente las grafías confirmadas de palabras reservadas y primitivas', () => {
		const source = [
			'si',
			'sino',
			'mientras',
			'repetir',
			'comenzar',
			'fin',
			'numero',
			'boolean',
			'mover',
			'derecha',
			'tomarFlor',
			'tomarPapel',
			'depositarFlor',
			'depositarPapel',
			'PosAv',
			'PosCa',
			'HayFlorEnLaEsquina',
			'HayPapelEnLaEsquina',
			'HayFlorEnLaBolsa',
			'HayPapelEnLaBolsa',
			'Informar'
		].join(' ');

		expect(lex(source).tokens.map(({ kind }) => kind)).toEqual([
			TokenKind.If,
			TokenKind.Else,
			TokenKind.While,
			TokenKind.Repeat,
			TokenKind.Begin,
			TokenKind.End,
			TokenKind.NumberType,
			TokenKind.BooleanType,
			TokenKind.Move,
			TokenKind.TurnRight,
			TokenKind.TakeFlower,
			TokenKind.TakePaper,
			TokenKind.DropFlower,
			TokenKind.DropPaper,
			TokenKind.PositionAvenue,
			TokenKind.PositionStreet,
			TokenKind.FlowerAtCorner,
			TokenKind.PaperAtCorner,
			TokenKind.FlowerInBag,
			TokenKind.PaperInBag,
			TokenKind.Inform,
			TokenKind.EndOfFile
		]);
		expect(lex('Si siempre informar').tokens.map(({ kind }) => kind)).toEqual([
			TokenKind.Identifier,
			TokenKind.Identifier,
			TokenKind.Identifier,
			TokenKind.EndOfFile
		]);
	});

	it('reconoce la estructura completa y las primitivas del R-Info de escritorio', () => {
		const source = [
			'programa',
			'procesos',
			'proceso',
			'areas',
			'AreaC',
			'AreaP',
			'AreaPC',
			'robots',
			'robot',
			'variables',
			'E',
			'S',
			'ES',
			'AsignarArea',
			'Iniciar',
			'Random',
			'bloquearEsquina',
			'liberarEsquina',
			'enviarMensaje',
			'recibirMensaje',
			':',
			';'
		].join(' ');

		expect(lex(source).tokens.map(({ kind }) => kind)).toEqual([
			TokenKind.Program,
			TokenKind.Processes,
			TokenKind.Process,
			TokenKind.Areas,
			TokenKind.AreaC,
			TokenKind.AreaP,
			TokenKind.AreaPC,
			TokenKind.Robots,
			TokenKind.Robot,
			TokenKind.Variables,
			TokenKind.InputParameter,
			TokenKind.OutputParameter,
			TokenKind.InputOutputParameter,
			TokenKind.AssignArea,
			TokenKind.StartRobot,
			TokenKind.Random,
			TokenKind.LockCorner,
			TokenKind.UnlockCorner,
			TokenKind.SendMessage,
			TokenKind.ReceiveMessage,
			TokenKind.Colon,
			TokenKind.Semicolon,
			TokenKind.EndOfFile
		]);
	});

	it('tokeniza un programa completo usado como fixture de compatibilidad', () => {
		const fixture = readFileSync(
			new URL('../../../../tests/fixtures/valid/programa-completo.ri', import.meta.url),
			'utf8'
		);
		const result = lex(fixture);

		expect(result.diagnostics).toEqual([]);
		expect(result.tokens[0]).toMatchObject({ kind: TokenKind.Program, lexeme: 'programa' });
		expect(result.tokens.filter(({ kind }) => kind === TokenKind.Colon)).toHaveLength(5);
		expect(result.tokens.at(-1)?.kind).toBe(TokenKind.EndOfFile);
	});

	it('conserva trivia y calcula posiciones UTF-16 a través de distintos saltos de línea', () => {
		const result = lex('área\r\n\t{uno\n😀}mover');

		expect(result.diagnostics).toEqual([]);
		expect(result.tokens).toEqual([
			{
				kind: TokenKind.Identifier,
				lexeme: 'área',
				span: {
					start: { offset: 0, line: 1, column: 1 },
					end: { offset: 4, line: 1, column: 5 }
				}
			},
			{
				kind: TokenKind.Move,
				lexeme: 'mover',
				span: {
					start: { offset: 15, line: 3, column: 4 },
					end: { offset: 20, line: 3, column: 9 }
				}
			},
			{
				kind: TokenKind.EndOfFile,
				lexeme: '',
				span: {
					start: { offset: 20, line: 3, column: 9 },
					end: { offset: 20, line: 3, column: 9 }
				}
			}
		]);
		expect(result.trivia.map(({ kind, lexeme, span }) => ({ kind, lexeme, span }))).toEqual([
			{
				kind: TriviaKind.LineBreak,
				lexeme: '\r\n',
				span: {
					start: { offset: 4, line: 1, column: 5 },
					end: { offset: 6, line: 2, column: 1 }
				}
			},
			{
				kind: TriviaKind.Whitespace,
				lexeme: '\t',
				span: {
					start: { offset: 6, line: 2, column: 1 },
					end: { offset: 7, line: 2, column: 2 }
				}
			},
			{
				kind: TriviaKind.Comment,
				lexeme: '{uno\n😀}',
				span: {
					start: { offset: 7, line: 2, column: 2 },
					end: { offset: 15, line: 3, column: 4 }
				}
			}
		]);
	});

	it('trata los separadores Unicode como saltos de línea', () => {
		const result = lex('uno\u2028dos\u2029tres');

		expect(result.tokens.map(({ lexeme, span }) => ({ lexeme, span }))).toEqual([
			{
				lexeme: 'uno',
				span: {
					start: { offset: 0, line: 1, column: 1 },
					end: { offset: 3, line: 1, column: 4 }
				}
			},
			{
				lexeme: 'dos',
				span: {
					start: { offset: 4, line: 2, column: 1 },
					end: { offset: 7, line: 2, column: 4 }
				}
			},
			{
				lexeme: 'tres',
				span: {
					start: { offset: 8, line: 3, column: 1 },
					end: { offset: 12, line: 3, column: 5 }
				}
			},
			{
				lexeme: '',
				span: {
					start: { offset: 12, line: 3, column: 5 },
					end: { offset: 12, line: 3, column: 5 }
				}
			}
		]);
		expect(result.trivia.map(({ kind, lexeme }) => ({ kind, lexeme }))).toEqual([
			{ kind: TriviaKind.LineBreak, lexeme: '\u2028' },
			{ kind: TriviaKind.LineBreak, lexeme: '\u2029' }
		]);
	});

	it('informa comentarios sin cerrar y conserva el texto para diagnóstico futuro', () => {
		const result = lex('{ comentario\nsin cierre');

		expect(result.tokens).toHaveLength(1);
		expect(result.trivia).toEqual([
			{
				kind: TriviaKind.Comment,
				lexeme: '{ comentario\nsin cierre',
				span: {
					start: { offset: 0, line: 1, column: 1 },
					end: { offset: 23, line: 2, column: 11 }
				}
			}
		]);
		expect(result.diagnostics).toEqual([
			{
				code: 'LEX002',
				phase: 'lexer',
				severity: 'error',
				message: 'El comentario no está cerrado. Agregá `}` antes del final del archivo.',
				span: {
					start: { offset: 0, line: 1, column: 1 },
					end: { offset: 23, line: 2, column: 11 }
				}
			}
		]);
	});

	it('se recupera de cada símbolo desconocido sin perder sus rangos', () => {
		const result = lex('@😀} mover');

		expect(result.diagnostics.map(({ code, span }) => ({ code, span }))).toEqual([
			{
				code: 'LEX001',
				span: {
					start: { offset: 0, line: 1, column: 1 },
					end: { offset: 1, line: 1, column: 2 }
				}
			},
			{
				code: 'LEX001',
				span: {
					start: { offset: 1, line: 1, column: 2 },
					end: { offset: 3, line: 1, column: 4 }
				}
			},
			{
				code: 'LEX001',
				span: {
					start: { offset: 3, line: 1, column: 4 },
					end: { offset: 4, line: 1, column: 5 }
				}
			}
		]);
		expect(result.tokens.map(({ kind, lexeme }) => ({ kind, lexeme }))).toEqual([
			{ kind: TokenKind.Move, lexeme: 'mover' },
			{ kind: TokenKind.EndOfFile, lexeme: '' }
		]);
	});

	it('produce un EOF estable para una fuente vacía', () => {
		const result = lex('');

		expect(result).toEqual({
			tokens: [
				{
					kind: TokenKind.EndOfFile,
					lexeme: '',
					span: {
						start: { offset: 0, line: 1, column: 1 },
						end: { offset: 0, line: 1, column: 1 }
					}
				}
			],
			trivia: [],
			diagnostics: []
		});
	});
});
