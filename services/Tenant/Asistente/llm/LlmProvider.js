/**
 * Contrato de un proveedor de modelo de lenguaje para el asistente. Cambiar de proveedor (Groq, otro)
 * es implementar `chat` sin tocar el orquestador ni las herramientas.
 *
 * Formato de mensajes: el de chat-completions de OpenAI, estándar de facto que Groq ya habla:
 *   { role: 'system'|'user'|'assistant'|'tool', content, tool_calls?, tool_call_id? }
 *
 * Herramientas: las definiciones de AsistenteToolsService.definiciones(): { name, description, parameters }.
 */
class LlmProvider {
    /**
     * @param {{mensajes: Array<Object>, herramientas?: Array<{name:string, description:string, parameters:Object}>}} entrada
     * @returns {Promise<{
     *   texto: string|null,
     *   llamadas: Array<{id:string, nombre:string, argumentos:Object|null}>,
     *   uso: {entrada:number, salida:number, total:number}|null
     * }>} `argumentos` es null cuando el modelo mandó algo que no es un objeto JSON: esa llamada no debe ejecutarse.
     * @throws {import('./errores').LlmError}
     */
    // eslint-disable-next-line no-unused-vars
    async chat(entrada) {
        throw new Error('LlmProvider.chat no está implementado');
    }
}

module.exports = LlmProvider;
