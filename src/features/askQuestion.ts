export interface QuickQuestionTemplate {
  id: string;
  label: string;
  prompt: string;
}

export class QuickQuestionService {
  public getTemplates(): QuickQuestionTemplate[] {
    return [
      { id: 'explain', label: 'Explain this code', prompt: 'Explain the selected code in detail.' },
      { id: 'how-it-works', label: 'How does this work?', prompt: 'Describe how the selected code works.' },
      { id: 'errors', label: 'What\'s wrong with this?', prompt: 'Find potential issues in the selected code.' },
      { id: 'improve', label: 'Suggest improvements', prompt: 'Suggest improvements for the selected code.' },
      { id: 'tests', label: 'Write tests', prompt: 'Write unit tests for the selected code.' }
    ];
  }

  public buildPrompt(templateId: string, prompt: string): string {
    const template = this.getTemplates().find(t => t.id === templateId);
    if (template && prompt) {
      return `${template.prompt}\n\n${prompt}`;
    }
    return template ? template.prompt : prompt;
  }
}
