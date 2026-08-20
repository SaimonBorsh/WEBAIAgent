export interface Project {
  id: string
  name: string
  path: string
  port: number
  defaultModel: string
  defaultAgent: string
  autoStart: boolean
  defaults?: SessionConfig
  archived?: boolean
  icon?: string
  iconTone?: 'auto' | 'user' | 'system'
  createdAt: number
  updatedAt: number
  running: boolean
}

export interface FreeModel {
  id: string
  name: string
  context: number
  output: number
}

export interface ManagerSettings {
  openBrowserOnStart: boolean
  passwordConfigured: boolean
}

export interface VersionInfo {
  name: string
  active: boolean
  hasServer: boolean
  hasWeb: boolean
  created: string | null
  description?: string
  size: number
}

export interface VersionsResult {
  current: string | null
  versions: VersionInfo[]
}

export interface SessionConfig {
  model?: string
  agent?: string
  temperature?: number
  topP?: number
  maxTokens?: number
  system?: string
}

export interface FsEntry {
  name: string
  path: string
  type: 'dir' | 'file'
  size?: number
}

export interface FsListResult {
  current: { name: string; path: string } | null
  parent: string | null
  entries: FsEntry[]
}

export interface FilePartInput {
  type: 'file'
  url: string
  filename?: string
  mime: string
}

export interface TextPartInput {
  type: 'text'
  text: string
}

export interface SessionInfo {
  id: string
  projectID: string
  directory: string
  parentID?: string
  title: string
  time: { created: number; updated: number }
  summary?: { additions: number; deletions: number; files: number }
}

export interface TextPart {
  type: 'text'
  id: string
  sessionID: string
  messageID: string
  text: string
  synthetic?: boolean
  ignored?: boolean
}

export interface ReasoningPart {
  type: 'reasoning'
  id: string
  sessionID: string
  messageID: string
  text: string
}

export interface ToolPart {
  type: 'tool'
  id: string
  sessionID: string
  messageID: string
  callID: string
  tool: string
  state: {
    status: 'pending' | 'running' | 'completed' | 'error'
    title?: string
    output?: string
    error?: string
    input?: Record<string, unknown>
    metadata?: Record<string, unknown>
    time?: { start?: number; end?: number }
  }
}

export type Part = TextPart | ReasoningPart | ToolPart | { type: string; id?: string; sessionID?: string; messageID?: string; [k: string]: unknown }

export interface MessageInfo {
  id: string
  sessionID: string
  role: 'user' | 'assistant'
  time: { created: number; completed?: number }
  model?: { providerID: string; modelID: string }
  modelID?: string
  providerID?: string
  error?: { name?: string; data?: { message?: string } } | null
  tokens?: { input?: number; output?: number; reasoning?: number }
  cost?: number
  parentID?: string
  finish?: string
}

export interface MessageItem {
  info: MessageInfo
  parts: Part[]
}

export interface Permission {
  id: string
  type: string
  pattern?: string | string[]
  sessionID: string
  messageID: string
  callID?: string
  title: string
  metadata: Record<string, unknown>
  time: { created: number }
}

export interface SessionStatusEvent {
  type: 'idle' | 'busy' | 'retry'
  attempt?: number
  message?: string
  next?: number
}

export interface FileDiff {
  file: string
  before: string
  after: string
  additions: number
  deletions: number
}

export interface QuestionOption {
  label: string
  description: string
}

export interface QuestionInfo {
  question: string
  header: string
  options: QuestionOption[]
  multiple?: boolean
  custom?: boolean
}

export interface QuestionRequest {
  id: string
  sessionID: string
  questions: QuestionInfo[]
  tool?: { messageID: string; callID: string }
}

export interface EventPayload {
  type: string
  properties: {
    sessionID?: string
    messageID?: string
    partID?: string
    info?: MessageInfo
    part?: Part
    delta?: string
    session?: SessionInfo
    status?: SessionStatusEvent
    todos?: unknown[]
    diff?: FileDiff[]
    error?: unknown
    title?: string
    pattern?: string | string[]
    type?: string
    callID?: string
    metadata?: Record<string, unknown>
    time?: { created: number }
    [k: string]: unknown
  }
}
