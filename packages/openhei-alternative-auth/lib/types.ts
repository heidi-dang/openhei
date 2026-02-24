import type { Auth, Provider, Model } from "@openhei-ai/sdk";

export interface PluginConfig {
	/** Enable specific providers */
	providers?: {
		duckduckgo?: boolean;
		perplexity?: boolean;
		mistral?: boolean;
		claude?: boolean;
		venice?: boolean;
	};
}

export interface UserConfig {
	global: Record<string, unknown>;
	models: Record<string, any>;
}

export interface OAuthServerInfo {
	port: number;
	ready: boolean;
	close: () => void;
	waitForCode: (state: string) => Promise<{ code: string } | null>;
}

export interface PKCEPair {
	challenge: string;
	verifier: string;
}

export interface AuthorizationFlow {
	pkce: PKCEPair;
	state: string;
	url: string;
}

export interface TokenSuccess {
	type: "success";
	access: string;
	refresh: string;
	expires: number;
}

export interface TokenFailure {
	type: "failed";
}

export type TokenResult = TokenSuccess | TokenFailure;

export interface ParsedAuthInput {
	code?: string;
	state?: string;
}

export interface JWTPayload {
	[key: string]: unknown;
}

export interface RequestBody {
	model: string;
	stream?: boolean;
	messages?: any[];
	[key: string]: unknown;
}

export type { Auth, Provider, Model };
