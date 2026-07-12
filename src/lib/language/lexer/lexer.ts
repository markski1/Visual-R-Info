import type { Diagnostic } from '../diagnostics/index.js';
import type { SourcePosition, SourceSpan } from '../source/index.js';
import { keywordKind } from './keywords.js';
import {
	TokenKind,
	TriviaKind,
	type Token,
	type TokenKind as TokenKindType,
	type Trivia,
	type TriviaKind as TriviaKindType
} from './token.js';

export interface LexerResult {
	readonly tokens: readonly Token[];
	readonly trivia: readonly Trivia[];
	readonly diagnostics: readonly Diagnostic[];
}

const IDENTIFIER_START = /[\p{L}_]/u;
const IDENTIFIER_CONTINUE = /[\p{L}\p{M}\p{N}_]/u;
const DECIMAL_DIGIT = /[0-9]/;
const HORIZONTAL_WHITESPACE = /[^\S\r\n\u2028\u2029]/u;

export function lex(source: string): LexerResult {
	return new Lexer(source).scan();
}

class Lexer {
	private offset = 0;
	private line = 1;
	private column = 1;
	private readonly tokens: Token[] = [];
	private readonly trivia: Trivia[] = [];
	private readonly diagnostics: Diagnostic[] = [];

	public constructor(private readonly source: string) {}

	public scan(): LexerResult {
		// La trivia se conserva separada: no afecta la gramática, pero sirve para diagnósticos y futuras herramientas de edición.
		while (!this.isAtEnd()) {
			const character = this.currentCharacter();

			if (this.isLineBreak(character)) {
				this.scanLineBreak();
			} else if (this.isHorizontalWhitespace(character)) {
				this.scanWhitespace();
			} else if (character === '{') {
				this.scanComment();
			} else if (this.isIdentifierStart(character)) {
				this.scanIdentifier();
			} else if (DECIMAL_DIGIT.test(character)) {
				this.scanInteger();
			} else {
				this.scanSymbol();
			}
		}

		const position = this.position();
		this.tokens.push({
			kind: TokenKind.EndOfFile,
			lexeme: '',
			span: { start: position, end: position }
		});

		return {
			tokens: this.tokens,
			trivia: this.trivia,
			diagnostics: this.diagnostics
		};
	}

	private scanLineBreak(): void {
		const start = this.position();
		const startOffset = this.offset;

		this.advanceLineBreak();
		this.addTrivia(TriviaKind.LineBreak, startOffset, start);
	}

	private scanWhitespace(): void {
		const start = this.position();
		const startOffset = this.offset;

		while (!this.isAtEnd() && this.isHorizontalWhitespace(this.currentCharacter())) {
			this.advanceCodePoint();
		}

		this.addTrivia(TriviaKind.Whitespace, startOffset, start);
	}

	private scanComment(): void {
		const start = this.position();
		const startOffset = this.offset;
		this.advanceCodePoint();

		while (!this.isAtEnd() && this.currentCharacter() !== '}') {
			if (this.isLineBreak(this.currentCharacter())) {
				this.advanceLineBreak();
			} else {
				this.advanceCodePoint();
			}
		}

		if (this.isAtEnd()) {
			this.diagnostics.push({
				code: 'LEX002',
				phase: 'lexer',
				severity: 'error',
				message: 'El comentario no está cerrado. Agregá `}` antes del final del archivo.',
				span: this.spanFrom(start)
			});
		} else {
			this.advanceCodePoint();
		}

		this.addTrivia(TriviaKind.Comment, startOffset, start);
	}

	private scanIdentifier(): void {
		const start = this.position();
		const startOffset = this.offset;

		while (!this.isAtEnd() && this.isIdentifierContinue(this.currentCharacter())) {
			this.advanceCodePoint();
		}

		const lexeme = this.source.slice(startOffset, this.offset);
		this.tokens.push({
			kind: keywordKind(lexeme) ?? TokenKind.Identifier,
			lexeme,
			span: this.spanFrom(start)
		});
	}

	private scanInteger(): void {
		const start = this.position();
		const startOffset = this.offset;

		while (!this.isAtEnd() && DECIMAL_DIGIT.test(this.currentCharacter())) {
			this.advanceCodePoint();
		}

		this.addToken(TokenKind.Integer, startOffset, start);
	}

	private scanSymbol(): void {
		const start = this.position();
		const startOffset = this.offset;
		const character = this.currentCharacter();
		this.advanceCodePoint();

		let kind: TokenKindType | undefined;
		switch (character) {
			case ':':
				kind = this.consume('=') ? TokenKind.Assign : TokenKind.Colon;
				break;
			case '+':
				kind = TokenKind.Plus;
				break;
			case '-':
				kind = TokenKind.Minus;
				break;
			case '*':
				kind = TokenKind.Star;
				break;
			case '/':
				kind = TokenKind.Slash;
				break;
			case '=':
				kind = TokenKind.Equal;
				break;
			case '<':
				if (this.consume('=')) kind = TokenKind.LessEqual;
				else if (this.consume('>')) kind = TokenKind.NotEqual;
				else kind = TokenKind.Less;
				break;
			case '>':
				kind = this.consume('=') ? TokenKind.GreaterEqual : TokenKind.Greater;
				break;
			case '~':
				kind = TokenKind.Not;
				break;
			case '&':
				kind = TokenKind.And;
				break;
			case '|':
				kind = TokenKind.Or;
				break;
			case '(':
				kind = TokenKind.LeftParenthesis;
				break;
			case ')':
				kind = TokenKind.RightParenthesis;
				break;
			case ',':
				kind = TokenKind.Comma;
				break;
			case ';':
				kind = TokenKind.Semicolon;
				break;
		}

		if (kind === undefined) {
			const lexeme = this.source.slice(startOffset, this.offset);
			this.diagnostics.push({
				code: 'LEX001',
				phase: 'lexer',
				severity: 'error',
				message: `El símbolo \`${lexeme}\` no pertenece a rinfo-core-v1.`,
				span: this.spanFrom(start)
			});
			return;
		}

		this.addToken(kind, startOffset, start);
	}

	private consume(expected: string): boolean {
		if (this.currentCharacter() !== expected) return false;
		this.advanceCodePoint();
		return true;
	}

	private addToken(kind: TokenKindType, startOffset: number, start: SourcePosition): void {
		this.tokens.push({
			kind,
			lexeme: this.source.slice(startOffset, this.offset),
			span: this.spanFrom(start)
		});
	}

	private addTrivia(kind: TriviaKindType, startOffset: number, start: SourcePosition): void {
		this.trivia.push({
			kind,
			lexeme: this.source.slice(startOffset, this.offset),
			span: this.spanFrom(start)
		});
	}

	private advanceLineBreak(): void {
		if (this.currentCharacter() === '\r' && this.peekCharacter() === '\n') {
			this.offset += 2;
		} else {
			const codePoint = this.source.codePointAt(this.offset);
			this.offset += codePoint !== undefined && codePoint > 0xffff ? 2 : 1;
		}
		this.line += 1;
		this.column = 1;
	}

	private advanceCodePoint(): void {
		const codePoint = this.source.codePointAt(this.offset);
		if (codePoint === undefined) return;
		// CodeMirror usa offsets UTF-16; los caracteres fuera del BMP ocupan dos unidades.
		const width = codePoint > 0xffff ? 2 : 1;
		this.offset += width;
		this.column += width;
	}

	private currentCharacter(): string {
		const codePoint = this.source.codePointAt(this.offset);
		return codePoint === undefined ? '' : String.fromCodePoint(codePoint);
	}

	private peekCharacter(): string {
		const currentCodePoint = this.source.codePointAt(this.offset);
		if (currentCodePoint === undefined) return '';
		const nextOffset = this.offset + (currentCodePoint > 0xffff ? 2 : 1);
		const nextCodePoint = this.source.codePointAt(nextOffset);
		return nextCodePoint === undefined ? '' : String.fromCodePoint(nextCodePoint);
	}

	private isHorizontalWhitespace(character: string): boolean {
		return HORIZONTAL_WHITESPACE.test(character);
	}

	private isLineBreak(character: string): boolean {
		return (
			character === '\r' || character === '\n' || character === '\u2028' || character === '\u2029'
		);
	}

	private isIdentifierStart(character: string): boolean {
		return IDENTIFIER_START.test(character);
	}

	private isIdentifierContinue(character: string): boolean {
		return IDENTIFIER_CONTINUE.test(character);
	}

	private isAtEnd(): boolean {
		return this.offset >= this.source.length;
	}

	private position(): SourcePosition {
		return { offset: this.offset, line: this.line, column: this.column };
	}

	private spanFrom(start: SourcePosition): SourceSpan {
		return { start, end: this.position() };
	}
}
