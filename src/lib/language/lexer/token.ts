import type { SourceSpan } from '../source/index.js';

export const TokenKind = {
	EndOfFile: 'EndOfFile',
	Identifier: 'Identifier',
	Integer: 'Integer',
	If: 'If',
	Else: 'Else',
	While: 'While',
	Repeat: 'Repeat',
	Begin: 'Begin',
	End: 'End',
	NumberType: 'NumberType',
	BooleanType: 'BooleanType',
	True: 'True',
	False: 'False',
	Move: 'Move',
	TurnRight: 'TurnRight',
	TakeFlower: 'TakeFlower',
	TakePaper: 'TakePaper',
	DropFlower: 'DropFlower',
	DropPaper: 'DropPaper',
	PositionAvenue: 'PositionAvenue',
	PositionStreet: 'PositionStreet',
	SetPosition: 'SetPosition',
	FlowerAtCorner: 'FlowerAtCorner',
	PaperAtCorner: 'PaperAtCorner',
	FlowerInBag: 'FlowerInBag',
	PaperInBag: 'PaperInBag',
	Inform: 'Inform',
	Assign: 'Assign',
	Plus: 'Plus',
	Minus: 'Minus',
	Star: 'Star',
	Slash: 'Slash',
	Equal: 'Equal',
	NotEqual: 'NotEqual',
	Less: 'Less',
	LessEqual: 'LessEqual',
	Greater: 'Greater',
	GreaterEqual: 'GreaterEqual',
	Not: 'Not',
	And: 'And',
	Or: 'Or',
	LeftParenthesis: 'LeftParenthesis',
	RightParenthesis: 'RightParenthesis',
	Comma: 'Comma'
} as const;

export type TokenKind = (typeof TokenKind)[keyof typeof TokenKind];

export interface Token {
	readonly kind: TokenKind;
	readonly lexeme: string;
	readonly span: SourceSpan;
}

export const TriviaKind = {
	Whitespace: 'Whitespace',
	LineBreak: 'LineBreak',
	Comment: 'Comment'
} as const;

export type TriviaKind = (typeof TriviaKind)[keyof typeof TriviaKind];

export interface Trivia {
	readonly kind: TriviaKind;
	readonly lexeme: string;
	readonly span: SourceSpan;
}
