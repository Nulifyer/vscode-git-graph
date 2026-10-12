export type RebaseAction = 'pick' | 'reword' | 'edit' | 'squash' | 'fixup' | 'drop';
export interface HistoryEntry { hash: string; author: string; date: number; subject: string; positions?: number[] }
export interface Worktree { path: string; head: string; branch: string | null; locked: boolean; prunable: boolean; main: boolean }
export interface RebaseEntry { hash: string; subject: string; action: RebaseAction; message?: string }
export interface RebasePlan { id: string; head: string; base: string; branch: string; entries: RebaseEntry[] }
export interface OperationState { operation: 'rebase' | 'merge' | 'cherry-pick' | 'revert' | null; conflicts: string[]; warning?: string }
export type RepositoryToolAction =
	{ kind: 'search'; query: string; mode?: 'fuzzy' | 'exact' | 'regex'; author?: string; since?: string; until?: string; file?: string; reference?: string; offset?: number; follow?: boolean } |
	{ kind: 'worktrees' } | { kind: 'addWorktree'; path: string; reference: string } |
	{ kind: 'removeWorktree'; path: string } | { kind: 'openWorktree'; path: string } |
	{ kind: 'rebasePlan'; base: string } | { kind: 'runRebase'; id: string; entries: RebaseEntry[] } |
	{ kind: 'operation' } | { kind: 'continue' } | { kind: 'abort' } | { kind: 'stageConflict'; file: string } | { kind: 'openConflict'; file: string };
export type RepositoryToolResult =
	{ kind: 'history'; entries: HistoryEntry[]; more: boolean } |
	{ kind: 'worktrees'; worktrees: Worktree[] } |
	{ kind: 'plan'; plan: RebasePlan } |
	{ kind: 'operation'; state: OperationState } |
	{ kind: 'open'; path: string; merge: boolean };
