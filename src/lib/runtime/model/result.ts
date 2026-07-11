import type { SourceSpan } from '../../language/source/index.js';

export type RuntimeResult<Value> =
	| { readonly ok: true; readonly value: Value }
	| { readonly ok: false; readonly error: RuntimeError };

export interface RuntimeError {
	readonly code: `RUN${number}`;
	readonly message: string;
	readonly span?: SourceSpan;
}

export function success<Value>(value: Value): RuntimeResult<Value> {
	return { ok: true, value };
}

export function failure(
	code: RuntimeError['code'],
	message: string,
	span?: SourceSpan
): RuntimeResult<never> {
	return { ok: false, error: { code, message, ...(span === undefined ? {} : { span }) } };
}
