import type { SourceSpan } from '../source/index.js';

export const TokenKind = {
	EndOfFile: 'EndOfFile',
	Identifier: 'Identifier',
	Integer: 'Integer',
	Program: 'Program',
	Processes: 'Processes',
	Process: 'Process',
	Areas: 'Areas',
	AreaC: 'AreaC',
	AreaP: 'AreaP',
	AreaPC: 'AreaPC',
	Robots: 'Robots',
	Robot: 'Robot',
	Variables: 'Variables',
	InputParameter: 'InputParameter',
	OutputParameter: 'OutputParameter',
	InputOutputParameter: 'InputOutputParameter',
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
	AssignArea: 'AssignArea',
	StartRobot: 'StartRobot',
	// CMRE (Concurrent Multi Robot Environment): concurrencia y comunicación entre robots.
	Random: 'Random',
	LockCorner: 'LockCorner',
	UnlockCorner: 'UnlockCorner',
	SendMessage: 'SendMessage',
	ReceiveMessage: 'ReceiveMessage',
	Assign: 'Assign',
	Colon: 'Colon',
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
	Comma: 'Comma',
	Semicolon: 'Semicolon'
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
