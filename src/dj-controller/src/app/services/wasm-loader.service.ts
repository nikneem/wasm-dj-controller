import { Injectable } from '@angular/core';

/**
 * Simple WASM loader for the audio engine
 * This manually loads the WASM module and provides TypeScript interfaces
 */
@Injectable({
    providedIn: 'root'
})
export class WasmLoaderService {
    private wasmModule: any = null;
    private wasmMemory: WebAssembly.Memory | null = null;

    async loadWasmModule(): Promise<any> {
        if (this.wasmModule) {
            return this.wasmModule;
        }

        try {
            // Fetch the WASM file
            const response = await fetch('/wasm/audio_engine.wasm');
            const wasmBuffer = await response.arrayBuffer();

            // Create memory for WASM
            this.wasmMemory = new WebAssembly.Memory({ initial: 256, maximum: 512 });

            // Instantiate the WASM module with imports
            const importObject = {
                env: {
                    memory: this.wasmMemory
                },
                wbg: {
                    __wbindgen_throw: (ptr: number, len: number) => {
                        throw new Error('WASM error');
                    }
                }
            };

            const result = await WebAssembly.instantiate(wasmBuffer, importObject);
            this.wasmModule = result.instance.exports;

            console.log('[WASM] Audio engine module loaded successfully');
            console.log('[WASM] Exports:', Object.keys(this.wasmModule));

            return this.wasmModule;
        } catch (error) {
            console.error('[WASM] Failed to load audio engine:', error);
            throw error;
        }
    }

    getModule(): any {
        return this.wasmModule;
    }

    isLoaded(): boolean {
        return this.wasmModule !== null;
    }
}
