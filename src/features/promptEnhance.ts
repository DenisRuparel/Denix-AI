export class PromptEnhancer {
  constructor(private readonly callAI: (prompt: string) => Promise<string>) {}

  public async enhancePrompt(original: string): Promise<string> {
    const enhancementRequest = `You are a prompt engineer. Improve the following prompt so it is specific, actionable, and includes any missing context.\n\nPrompt:${original}\n`;
    return this.callAI(enhancementRequest);
  }
}
