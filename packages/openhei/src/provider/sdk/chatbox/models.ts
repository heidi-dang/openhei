// Minimal shim for Chatbox models loader.
// The real implementation may fetch available models from Chatbox API.
// Returning an empty array is safe for builds and preserves runtime behavior
// when no Chatbox credentials are present.

export const ChatboxModels = {
  async fetchModels(): Promise<Array<any>> {
    return []
  },
}

export default ChatboxModels
