import { SelectionContext } from '../features/selection';
import { RuleFile } from '../features/rules';
import { MemoriesManager, MemoryEntry } from '../features/memories';
import { GuidelinesManager } from '../features/guidelines';

export interface BuiltContext {
  memories: string;
  relevantMemories: string[];
  guidelines: string;
  rules: Array<{ name: string; path: string; content: string }>;
  selection?: SelectionContext | null;
}

export class ContextManager {
  constructor(
    private readonly memories: MemoriesManager,
    private readonly guidelines: GuidelinesManager,
    private readonly rules: RulesManagerWrapper,
    private readonly selectionProvider: () => SelectionContext | null
  ) {}

  public async buildContext(keywords: string[]): Promise<BuiltContext> {
    const [guidelinesText, rulesList, relevantMemories] = await Promise.all([
      this.guidelines.loadGuidelines(),
      this.rules.listRuleFiles(),
      this.memories.getRelevantMemories(keywords)
    ]);

    // Load rule contents
    const rulesWithContent = await Promise.all(
      rulesList.map(async (rule) => {
        const content = await this.rules.getRuleContent(rule.name);
        return { name: rule.name, path: rule.path, content };
      })
    );

    // Convert memory entries to strings
    const memoryStrings = relevantMemories.map(m => `## ${m.section}\n${m.content}`);

    return {
      memories: await this.memories.loadMemories(),
      relevantMemories: memoryStrings,
      guidelines: guidelinesText,
      rules: rulesWithContent,
      selection: this.selectionProvider()
    };
  }
}

/**
 * Thin wrapper so we can inject a subset of methods from RulesManager without
 * introducing a circular dependency.
 */
export interface RulesManagerWrapper {
  listRuleFiles(): Promise<RuleFile[]>;
  getRuleContent(name: string): Promise<string>;
}
