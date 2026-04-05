# Codebase Wiring Map
> Complete dependency graph — what every file imports and who imports it.

---

## LEGEND
- `→` means "imports from" / "depends on"
- `←` means "imported by" / "depended on by"
- `⟺` means bidirectional (circular-adjacent, resolved via types)

---

## TABLE OF CONTENTS
1. [Entry Points](#1-entry-points)
2. [Orchestrator Layer](#2-orchestrator-layer)
3. [Agents — Screen Agent](#3-agents--screen-agent)
4. [Agents — Behaviour](#4-agents--behaviour)
5. [Agents — Voice Agent](#5-agents--voice-agent)
6. [Agents — Manager/Worker/Verifier](#6-agents--managerworkerverifier)
7. [Voice Pipeline (Hooks)](#7-voice-pipeline-hooks)
8. [Voice Lib](#8-voice-lib)
9. [RAG System](#9-rag-system)
10. [Memory](#10-memory)
11. [Reasoning Engines](#11-reasoning-engines)
12. [Lib — Core](#12-lib--core)
13. [Lib — Observability & Router & Prompts](#13-lib--observability-router-prompts)
14. [Lib — External API Integrations](#14-lib--external-api-integrations)
15. [Lib — Desktop & Jarvis Capabilities](#15-lib--desktop--jarvis-capabilities)
16. [Lib — Persistence](#16-lib--persistence)
17. [Contexts (React State)](#17-contexts-react-state)
18. [Hooks (Non-voice)](#18-hooks-non-voice)
19. [Browser Subsystem](#19-browser-subsystem)
20. [Components — Core UI](#20-components--core-ui)
21. [Components — Modules & Layout](#21-components--modules--layout)
22. [Components — Dashboard](#22-components--dashboard)
23. [Components — IDE](#23-components--ide)
24. [App Entry (React Root)](#24-app-entry-react-root)
25. [Electron Layer](#25-electron-layer)
26. [Python Sidecar](#26-python-sidecar)
27. [Vite Plugins (Dev Only)](#27-vite-plugins-dev-only)

---

## 1. ENTRY POINTS

### `src/main.tsx`
```
→ react-dom/client
→ react-error-boundary
→ ./App.tsx
→ ./ErrorFallback.tsx
← (HTML script tag only — true root)
```

### `src/App.tsx`
```
→ react (useState, useRef, useEffect, useCallback, lazy, Suspense)
→ @/hooks/useLocalStorage
→ sonner (Toaster, toast)
→ @/lib/types (Thread, Workspace, Message, Source, UploadedFile, FocusMode, UserSettings)
→ @/lib/helpers (generateId, generateThreadTitle, processFile)
→ @/lib/api (executeWebSearch, generateFollowUpQuestions, executeModelCouncil)
→ @/lib/rag (ragSearch)
→ @/lib/defaults (DEFAULT_USER_SETTINGS)
→ @/lib/chat-tools (runChatWithTools)
→ @/lib/thinking-engine (classifyComplexity)
→ @/lib/learning-engine (getLearnedContext)
→ @/lib/social-scheduler (checkAndFireScheduled)
→ @/lib/jarvis-tool-system-prompt (buildJarvisToolSystemPrompt)
→ @/lib/jarvis-ide-chat-types (presetToInstruction)
→ @/lib/healthDashboardAccess (canAccessHealthDashboard, HEALTH_DASHBOARD_403_FLAG)
→ @/browser/screen-browser-act (handleBrowserActGoal)
→ @/browser/types-layout (InspectorAiRequest, InspectorChatTicket)
→ @/contexts/TuneInControlContext (TuneInControlProvider)
→ @/contexts/BrowserControlContext (BrowserControlProvider, useBrowserControl, useBrowserGuideMode)
→ @/contexts/MediaCanvasContext (MediaCanvasProvider, useMediaCanvas, useMediaCanvasGenerating)
→ @/contexts/CodeEditorContext (CodeEditorProvider)
→ @/contexts/useCodeEditorHooks (useCodeEditor)
→ @/contexts/MusicPlayerContext (MusicPlayerProvider, useMusicPlayer, useMusicPlayerGenerating)
→ @/hooks/useWakeWord
→ @/components/AppSidebar
→ @/components/EmptyState
→ @/components/Message
→ @/components/MessageSkeleton
→ @/components/QueryInput
→ @/components/WorkspaceDialog
→ @/components/FocusModeSelector
→ @/components/SettingsDialog
→ @/components/ProactiveVisionLoop
→ @/components/OAuthCallback
→ @/components/FileAttachment
→ @/components/FilePreviewModal
→ @/components/A2EStudioPanel
→ @/components/AgentBrowserPanel
→ @/components/VoiceMode
→ @/components/WebBrowserModal
→ @/components/MediaCanvasModal
→ @/components/MusicPlayerModal
→ @/components/layout/AppModuleRails
→ @/components/HealthDashboardRoute
→ @/app/dashboard/page
→ @/components/ui/scroll-area
→ @/components/ui/separator
→ @/components/ui/button
→ @/components/ui/badge
→ @/components/ui/switch
→ @/components/ui/label
→ @phosphor-icons/react
← src/main.tsx
```

---

## 2. ORCHESTRATOR LAYER

### `src/orchestrator/index.ts`  ← THE HUB
```
→ eventemitter3 (EventEmitter — globalEmitter)
→ ../agents/behaviour/spaces-client (SpacesClient)
→ ../agents/behaviour/behaviour-logger (BehaviourLogger)
→ @/agents/screen-agent (ScreenAgent)
→ @/agents/screen-agent/types (ScreenState)
→ @/agents/voice (createVoiceAgent, VoiceAgent)
→ @/browser/screen-browser-act (JarvisBrowserActIpcPayload)
→ ./screen-agent-handler (ScreenAgentHandler)
→ ./screen-agent-launcher (ScreenAgentLauncher)
→ ./jarvis-vision-client (JarvisVision)
→ ./jarvis-vision-proactive (startJarvisVisionProactive)
← electron/main.cjs (require via tsx/cjs at runtime)
EXPORTS: globalEmitter, bootstrapJarvisScreenAgent, getJarvisLatestScreenContext, getJarvisVisionClient
         ScreenAgentHandler, ScreenAgentLauncher, JarvisVision, VisionFace, VisionEmotionFace
```

### `src/orchestrator.ts`  ← MANAGER-WORKER CHAT ORCHESTRATOR
```
→ uuid
→ openai
→ @/lib/contextInjector (assembleContext)
→ @/lib/observability/alertSystem (alertSystem)
→ @/lib/observability/telemetryCollector (telemetry)
→ @/lib/prompts/promptAssembler (assembleSystemPrompt)
→ @/lib/prompts/promptExperiments (promptExperiments)
→ @/lib/prompts/promptRegistry (promptRegistry)
→ @/lib/prompts/promptRegressionTests (runBlockerTestsOnly)
→ @/lib/contextCompactor (ConversationTurn)
→ @/lib/toolLoader (loadToolsForIntent, formatToolsForOpenAI)
→ @/lib/tokenCounter (countTokens)
→ @/lib/router/overrideRules (applyOverrides)
→ @/lib/router/routeCache (routeCache)
→ @/lib/router/semanticRouter (semanticRouter)
→ @/memory/sessionIndex (SessionIndex)
→ @/rag/cragEvaluator (buildRagContext, evaluateRetrieval)
→ @/rag/ingestOnStartup (runStartupIngestion, shouldReIngest)
→ @/rag/longTermIndex (LongTermIndex)
→ @/rag/retrievalGate (RetrievalGate)
→ @/agents/managerWorkerOrchestrator (ManagerWorkerOrchestrator)
→ @/lib/api/mwResultToAssistantPayload (mwResultToAssistantPayload)
→ @/lib/persistence/sessionPersistenceAdapter (PersistedSession)
← @/lib/prompts/promptRegressionTests (semanticRouter import)
← app/api routes
```

### `src/orchestrator/screen-agent-handler.ts`
```
→ eventemitter3 (EventEmitter — type only)
→ @/agents/screen-agent (ScreenAgent — type only)
→ @/agents/behaviour/proactive-engine (EVT_BEHAVIOUR_SUGGESTION, EVT_BEHAVIOUR_ACCEPT)
→ @/agents/screen-agent/types (AgentMode)
→ @/browser/screen-browser-act (BROWSER_ACT_GOAL_CONTINUE, JarvisBrowserActIpcPayload)
← src/orchestrator/index.ts
EXPORTS: ScreenAgentHandler, ScreenAgentHandlerOptions
EVENTS CONSUMED: intent:resolved, jarvis:user:confirmed, jarvis:user:cancelled, behaviour:suggestion
EVENTS EMITTED:  jarvis:speak, intent:resolved (to ScreenAgent)
```

### `src/orchestrator/screen-agent-launcher.ts`
```
→ node:child_process (spawn, ChildProcess)
→ node:path (join)
→ ws (WebSocket — probe connection)
← src/orchestrator/index.ts
EXPORTS: ScreenAgentLauncher
```

### `src/orchestrator/jarvis-vision-client.ts`
```
→ (no local imports — pure HTTP fetch to port 8002)
← src/orchestrator/index.ts
← src/orchestrator/jarvis-vision-proactive.ts
EXPORTS: JarvisVision, VisionFace, VisionEmotionFace
```

### `src/orchestrator/jarvis-vision-proactive.ts`
```
→ eventemitter3 (EventEmitter — type only)
→ ./jarvis-vision-client (JarvisVision — type only)
← src/orchestrator/index.ts
```

### `src/orchestrator/agent-registry.ts`
```
→ @/agents/screen-agent (ScreenAgent)
← (internal orchestrator use)
```

---

## 3. AGENTS — SCREEN AGENT

### `src/agents/screen-agent/index.ts`
```
→ eventemitter3
→ ../base-agent (BaseAgent)
→ ./advice-generator (AdviceGenerator, JarvisAdviceLlm)
→ ./config (DEFAULT_CONFIG)
→ ./goal-executor (GoalExecutor)
→ ./python-bridge (PythonBridge)
→ ./safety-gate (SafetyGate)
→ ./significance-detector (SignificanceDetector)
→ ./state-manager (StateManager, JarvisMemoryClient)
→ ./types (AgentMode, ScreenAgentConfig, ScreenAgentEvents, ScreenState)
← src/orchestrator/index.ts
← src/orchestrator/screen-agent-handler.ts (type only)
← src/orchestrator/agent-registry.ts
← src/agents/index.ts
EXPORTS: ScreenAgent + re-exports all sub-modules
EVENTS EMITTED: screen:state_changed, screen:mode_changed, screen:advice_generated,
                screen:goal:created, screen:goal:approved, screen:goal:executed, screen:goal:rejected
```

### `src/agents/screen-agent/advice-generator.ts`
```
→ @/lib/llm (callLlmWithTools)
→ ./types (ScreenState — type)
← ./index.ts
EXPORTS: AdviceGenerator, JarvisAdviceLlm
```

### `src/agents/screen-agent/config.ts`
```
→ ./types (AgentMode, ScreenAgentConfig)
← ./index.ts, ./goal-executor.ts, ./safety-gate.ts, ./significance-detector.ts
EXPORTS: DEFAULT_CONFIG, MAX_GOAL_DURATION_MS, SAME_EVENT_COOLDOWN_MS,
         DENYLIST, APPROVAL_REQUIRED_PATTERNS, VOICE_PROTECTED_PATTERNS
```

### `src/agents/screen-agent/goal-executor.ts`
```
→ eventemitter3
→ ./config (MAX_GOAL_DURATION_MS)
→ ./safety-gate (SafetyGate — type)
→ ./types (AgentAction, GoalResult, ScreenAgentEvents)
→ ./python-bridge (PythonBridge — type)
← ./index.ts
EXPORTS: GoalExecutor
```

### `src/agents/screen-agent/python-bridge.ts`
```
→ eventemitter3
→ ws (WebSocket)
← ./index.ts, ./goal-executor.ts
EXPORTS: PythonBridge, ConnectionStatus
WIRE: sends/receives JSON over WebSocket to python/screen_agent.py
```

### `src/agents/screen-agent/safety-gate.ts`
```
→ ./config (APPROVAL_REQUIRED_PATTERNS, DENYLIST)
→ ./types (AgentAction — type)
← ./index.ts, ./goal-executor.ts
EXPORTS: SafetyGate
```

### `src/agents/screen-agent/significance-detector.ts`
```
→ ./config (SAME_EVENT_COOLDOWN_MS)
→ ./types (ScreenState, SignificanceResult)
← ./index.ts
EXPORTS: SignificanceDetector
```

### `src/agents/screen-agent/state-manager.ts`
```
→ ./types (ScreenState — type)
← ./index.ts
EXPORTS: StateManager, JarvisMemoryClient
```

### `src/agents/screen-agent/types.ts`
```
→ (no local imports)
← everything in screen-agent/
EXPORTS: AgentMode, ScreenState, ScreenAgentConfig, ScreenAgentEvents,
         AgentAction, GoalResult, SignificanceResult, AssertionType
```

---

## 4. AGENTS — BEHAVIOUR

### `src/agents/behaviour/types.ts`
```
→ (no imports)
← behaviour-logger.ts, behaviour-analyser.ts, intent-predictor.ts
EXPORTS: BehaviourEvent, BehaviourEventType, DailyAnalysis, SessionSummary
```

### `src/agents/behaviour/spaces-client.ts`
```
→ @aws-sdk/client-s3 (GetObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client)
← behaviour-logger.ts, behaviour-analyser.ts, intent-predictor.ts
← src/orchestrator/index.ts
← src/agents/behaviour/spaces-client.ts (self — singleton)
EXPORTS: SpacesClient
```

### `src/agents/behaviour/behaviour-logger.ts`
```
→ uuid
→ ./spaces-client (SpacesClient)
→ ./types (BehaviourEvent, BehaviourEventType, SessionSummary)
← src/orchestrator/index.ts
EXPORTS: BehaviourLogger
```

### `src/agents/behaviour/behaviour-analyser.ts`
```
→ ./spaces-client (SpacesClient)
→ ./types (BehaviourEvent, DailyAnalysis, SessionSummary)
← ./intent-predictor.ts
EXPORTS: BehaviourAnalyser
```

### `src/agents/behaviour/intent-predictor.ts`
```
→ ./behaviour-analyser (DailyAnalysis, BehaviourAnalyser)
→ ./spaces-client (SpacesClient)
→ ./types (BehaviourEvent, BehaviourEventType)
← ./proactive-engine.ts
EXPORTS: IntentPredictor
```

### `src/agents/behaviour/proactive-engine.ts`
```
→ ./intent-predictor (IntentPredictor)
← src/orchestrator/screen-agent-handler.ts
EXPORTS: ProactiveEngine, EVT_BEHAVIOUR_SUGGESTION, EVT_BEHAVIOUR_ACCEPT
```

---

## 5. AGENTS — VOICE AGENT

### `src/agents/voice/index.ts`
```
→ node:child_process (spawn, ChildProcess)
→ node:fs/promises (unlink, writeFile)
→ node:os (platform, tmpdir)
→ node:path (join)
→ eventemitter3 (EventEmitter — type)
→ @/lib/elevenlabs-tts-stream (fetchElevenLabsPcm)
← src/orchestrator/index.ts (createVoiceAgent)
EXPORTS: VoiceAgent, createVoiceAgent
EVENTS CONSUMED: jarvis:speak (from globalEmitter)
PLAYBACK: Windows→PowerShell, macOS→ffplay, Linux→aplay, or Web AudioContext
```

### `src/agents/index.ts`
```
→ ./base-agent (BaseAgent)
→ ./screen-agent (ScreenAgent)
← (barrel export)
```

### `src/agents/base-agent.ts`
```
→ (no imports)
← ./index.ts, screen-agent/index.ts
EXPORTS: BaseAgent (abstract class)
```

---

## 6. AGENTS — MANAGER/WORKER/VERIFIER

### `src/agents/taskState.ts`
```
→ uuid
← managerAgent.ts, workerAgent.ts, managerWorkerOrchestrator.ts
EXPORTS: TaskState, TaskType, createTaskState, addRequirement, etc.
```

### `src/agents/managerAgent.ts`
```
→ openai
→ @/memory/sessionIndex (SessionIndex)
→ @/lib/router/semanticRouter (RouteResult — type)
→ @/reasoning/cotScratchpad (buildScratchpadSummary, getActiveSubGoal)
→ @/reasoning/reactEngine (ReActDecision — type)
→ @/reasoning/problemDecomposer (ProblemDecomposer)
→ @/reasoning/reactLoopController (ReActLoopController, LoopResult)
→ @/reasoning/scratchpadStore (scratchpadStore)
→ @/reasoning/thoughtGenerator (ThoughtContext — type)
→ ./taskState (TaskState, TaskType)
← ./managerWorkerOrchestrator.ts
EXPORTS: ManagerAgent
```

### `src/agents/workerAgent.ts`
```
→ openai
→ ./taskState (TaskType — type)
→ @/lib/toolLoader (formatToolsForOpenAI, loadToolsForIntent, OpenAiToolSpec)
→ @/lib/tokenCounter (countTokens, TOKEN_LIMITS)
→ @/reasoning/modelRouter (modelRouter)
→ @/reasoning/routingClassifier (RoutingSignals — type)
→ @/reasoning/confidenceOrchestrator (confidenceOrchestrator)
→ @/reasoning/confidenceTypes (ELICITATION_INSTRUCTION)
→ @/reasoning/lessonsStore (lessonsStore)
← ./managerWorkerOrchestrator.ts
EXPORTS: WorkerAgent, WorkerResult
```

### `src/agents/verifierAgent.ts`
```
→ openai
← ./managerWorkerOrchestrator.ts (implicitly — verification step)
EXPORTS: VerifierAgent
```

### `src/agents/managerWorkerOrchestrator.ts`
```
→ ./managerAgent (ManagerAgent)
→ ./workerAgent (WorkerAgent, WorkerResult)
→ ./taskState (TaskState, TaskType)
→ @/lib/router/semanticRouter (RouteResult — type)
→ @/memory/sessionIndex (SessionIndex)
→ @/lib/observability/telemetryCollector (telemetry)
→ @/reasoning/reflexionController (ReflexionController, MAX_REFLEXION_ITERATIONS)
→ @/reasoning/complexityDetector (ComplexityDetector)
→ @/reasoning/lessonsStore (lessonsStore)
→ @/reasoning/reactLoopController (ReActLoopController)
→ @/reasoning/reactTypes (ReActTrace — type)
→ @/reasoning/confidenceElicitor (ConfidenceElicitor)
→ @/reasoning/confidenceTypes (PreTaskEstimate — type)
→ @/reasoning/confidenceMemoryStore (confidenceMemoryStore)
→ @/reasoning/confidenceOrchestrator (confidenceOrchestrator)
→ @/reasoning/reflexionController (ReflexionResult — type)
← src/orchestrator.ts
← src/lib/api/mwResultToAssistantPayload.ts
EXPORTS: ManagerWorkerOrchestrator, MAX_WORKER_ITERATIONS
```

---

## 7. VOICE PIPELINE (HOOKS)

### `src/hooks/useRealtimeVoice.ts`  ← MOST CONNECTED HOOK
```
→ react (useCallback, useEffect, useRef, useState)
→ ./useVision (VisionContext — type)
→ @/contexts/TuneInControlContext (TuneInControl — type)
→ @/contexts/BrowserControlContext (BrowserControl — type)
→ @/contexts/MediaCanvasContext (MediaCanvasControl — type)
→ @/contexts/CodeEditorContext (CodeEditorControl — type)
→ @/contexts/MusicPlayerContext (MusicPlayerControl — type)
→ @/lib/browser-agent (runBrowserAgent)
→ @/lib/media-api (generateImage, editImage, createVideo)
→ @/lib/code-runner (runCode)
→ @/lib/hf-api (searchHuggingFace)
→ @/lib/github-api (searchGitHub)
→ @/lib/suno-api (generateMusic)
→ @/lib/plaid-api (getBalances, getTransactions, getSpendingSummary)
→ @/lib/story-api (searchStories, getStoryContent, getRandomStory, continueReading, jumpToPage, getCurrentBook)
→ @/lib/social-api (postTweet, readSocialFeed, readComments, replyViaBrowser)
→ @/lib/hallucination-guard (quickScan)
→ @/lib/social-scheduler (schedulePost, listScheduledPostsSummary, cancelScheduledPost)
→ @/lib/email-api (emailListInbox, emailReadMessage, emailSend, emailSearch, emailListFolders, emailDelete, emailMarkRead)
→ @/lib/vonage-api (vonageSendSms, vonageVoiceCall, vonageAiVoiceCall)
→ @/lib/thinking-engine (getVoiceThinkingPrompt)
→ @/lib/learning-engine (analyzeExchangeAsync, getLearnedContext, getLearningStats)
→ @/lib/behavioral-engine (parseBehavioralMarkup, stripBehavioralMarkup, hasUnclosedTag, buildPersonalityInstructions, BehavioralChunk)
→ @/lib/types (UserSettings — type)
→ @/lib/voice-registry (VoiceProfile, getVoiceProfileMap, getDefaultVoiceProfile)
→ @/lib/screen-intent-classifier (classifyScreenIntent)
→ @/lib/jarvis-desktop-os-capabilities (getJarvisVoiceDesktopOsHintSection)
→ @/lib/chat-tools-desktop-automation-tools (DESKTOP_AUTOMATION_TOOLS)
→ @/lib/desktop-automation-tool-runner (runDesktopAutomationTool, desktopAutomationChatSpecToRealtime)
→ @/lib/tts (playTts, getEffectiveTtsVoice, stopAllAudio, stopBrowserTTS)
← @/components/VoiceMode.tsx
EXPORTS: useRealtimeVoice, VoicePipelineState
```

### `src/hooks/useVision.ts`
```
→ react (useState, useEffect, useRef, useCallback)
← @/hooks/useRealtimeVoice.ts (VisionContext type)
← @/components/VoiceMode.tsx
EXPORTS: useVision, VisionContext
```

### `src/hooks/useSpeechRecognition.ts`
```
→ react (useCallback, useEffect, useRef, useState)
← @/hooks/useRealtimeVoice.ts (fallback STT)
EXPORTS: useSpeechRecognition
```

### `src/hooks/useScreenVision.ts`
```
→ react (useState, useEffect, useRef, useCallback)
← (internal desktop screenshot capture)
EXPORTS: useScreenVision
```

---

## 8. VOICE LIB

### `src/lib/voice/index.ts`  ← BARREL
```
→ @/lib/voice/types
→ @/lib/voice/voiceSession (NullVoiceSession, VoiceSessionStub)
→ @/lib/voice/errors (VoiceRealtimeError, VoiceRealtimeErrorCode)
→ @/lib/voice/openaiRealtimeVoiceSession (OpenAIRealtimeVoiceSession)
← @/components/VoiceMode.tsx (transitively)
← @/hooks/useRealtimeVoice.ts (transitively)
```

### `src/lib/voice/types.ts`
```
→ (no imports)
← voiceSession.ts, openaiRealtimeVoiceSession.ts, errors.ts, index.ts
EXPORTS: VoiceEventMap, VoiceSessionState, VoiceConnectionState, VoiceTurn, VoiceEventName, VoiceEventHandler
```

### `src/lib/voice/voiceSession.ts`
```
→ @/lib/voice/types (VoiceEventHandler, VoiceEventName)
← openaiRealtimeVoiceSession.ts, index.ts
EXPORTS: VoiceSession (interface), NullVoiceSession, VoiceSessionStub
```

### `src/lib/voice/openaiRealtimeVoiceSession.ts`
```
→ @/lib/voice/errors (VoiceRealtimeError)
→ @/lib/voice/types (VoiceEventMap, VoiceConnectionState, etc.)
→ @/lib/voice/voiceSession (VoiceSession — type)
← index.ts
EXPORTS: OpenAIRealtimeVoiceSession
WIRE: WebRTC / WebSocket → OpenAI Realtime API
```

### `src/lib/voice/errors.ts`
```
→ (no imports)
← openaiRealtimeVoiceSession.ts, index.ts
EXPORTS: VoiceRealtimeError, VoiceRealtimeErrorCode
```

### `src/lib/tts.ts`
```
→ (no local imports — uses fetch, Web AudioContext, speechSynthesis)
← @/hooks/useRealtimeVoice.ts
← @/lib/chat-tools.ts (playTts, getEffectiveTtsVoice)
← @/components/ProactiveVisionLoop.tsx (playTts)
← @/lib/voice-mode-ui.ts (isRendererVoiceModeOpen)
EXPORTS: synthesizeSpeechChunk, playAudioBuffer, stopAllAudio, speakWithBrowserTTS,
         stopBrowserTTS, playTts, getEffectiveTtsVoice
WIRE: POST /api/tts → electron/main.cjs proxy → OpenAI TTS API
```

### `src/lib/elevenlabs-tts-stream.ts`
```
→ (no local imports — uses fetch)
← @/agents/voice/index.ts (VoiceAgent OS playback)
EXPORTS: fetchElevenLabsPcm
WIRE: POST /api/tts/elevenlabs → electron/main.cjs proxy → ElevenLabs API
```

### `src/lib/voice-registry.ts`
```
→ (localStorage only)
← @/hooks/useRealtimeVoice.ts
← @/lib/behavioral-engine.ts
← @/components/SettingsDialog.tsx
EXPORTS: VoiceRegistry, VoiceProfile, VoiceSettings, getVoiceRegistry, saveVoiceRegistry, etc.
```

### `src/lib/voice-pipeline-config.ts`
```
→ (no imports)
← (config constant)
EXPORTS: VOICE_PIPELINE_STRATEGY = 'composed'
```

### `src/lib/voice-mode-ui.ts`
```
→ (window.electronAPI IPC — no local imports)
← @/components/VoiceMode.tsx (setRendererVoiceModeOpen)
← @/components/ProactiveVisionLoop.tsx (isRendererVoiceModeOpen)
EXPORTS: setRendererVoiceModeOpen, isRendererVoiceModeOpen
WIRE: IPC → electron/preload.cjs → electron/main.cjs → VoiceAgent.setPlaybackSuppressed()
```

### `src/lib/speech-synthesis-voice.ts`
```
→ (Web Speech API — no local imports)
← @/hooks/usePreferredSpeechVoice.ts
EXPORTS: pickPreferredSpeechVoice
```

### `src/lib/vonage-api.ts`
```
→ (fetch — no local imports)
← @/hooks/useRealtimeVoice.ts
← @/lib/chat-tools.ts
EXPORTS: vonageSendSms, vonageVoiceCall, vonageAiVoiceCall
WIRE: POST /api/vonage/* → electron/main.cjs proxy → Vonage API
```

### `src/lib/screen-intent-classifier.ts`
```
→ (no local imports — LLM prompt via fetch)
← @/hooks/useRealtimeVoice.ts
EXPORTS: classifyScreenIntent
```

### `src/lib/behavioral-engine.ts`
```
→ @/lib/voice-registry (VoiceProfile, VoiceSettings)
← @/hooks/useRealtimeVoice.ts
EXPORTS: parseBehavioralMarkup, stripBehavioralMarkup, hasUnclosedTag,
         buildPersonalityInstructions, BehavioralChunk
```

---

## 9. RAG SYSTEM

### `src/rag/longTermIndex.ts`
```
→ node:fs, node:path
→ faiss-node (IndexFlatIP)
→ openai
→ @/rag/retrievalGate (LongTermIndex — type contract)
→ @/rag/bm25Index (BM25Index)
→ ./codeChunker (chunkCode, detectLanguage)
← ./ingestPipeline.ts
← ./ingestOnStartup.ts
← src/orchestrator.ts
EXPORTS: LongTermIndex (class), LongTermQueryResult, LongTermChunk
```

### `src/rag/retrievalGate.ts`
```
→ @/memory/sessionIndex (SessionIndex — type)
→ ./longTermIndex (LongTermQueryResult, LongTermChunk)
← src/orchestrator.ts
← src/lib/prompts/promptRegressionTests.ts
EXPORTS: RetrievalGate, LongTermIndex (interface), GateResult, RetrievalGateSource
```

### `src/rag/bm25Index.ts`
```
→ (no imports — pure algorithm)
← ./longTermIndex.ts
EXPORTS: BM25Index, BM25Result
```

### `src/rag/bm25.ts`
```
→ (no imports — pure BM25 algorithm)
← ./bm25Index.ts
EXPORTS: bm25Score
```

### `src/rag/codeChunker.ts`
```
→ node:module (createRequire)
← ./longTermIndex.ts, ./ingestPipeline.ts
EXPORTS: chunkCode, detectLanguage, CodeChunk
```

### `src/rag/cragEvaluator.ts`
```
→ openai
← src/orchestrator.ts
EXPORTS: buildRagContext, evaluateRetrieval
```

### `src/rag/faissFlatIp.ts`
```
→ (no imports — faiss wrapper)
← (internal)
EXPORTS: FaissFlatIp
```

### `src/rag/ingestPipeline.ts`
```
→ node:fs, node:path, node:fs/promises
→ ./longTermIndex (LongTermIndex)
→ ./codeChunker (chunkCode, detectLanguage)
← ./ingestOnStartup.ts
EXPORTS: ingestDirectory, ingestFile
```

### `src/rag/ingestOnStartup.ts`
```
→ node:fs, node:path
→ ./ingestPipeline (ingestDirectory, ingestFile)
→ ./longTermIndex (LongTermIndex)
← src/orchestrator.ts
EXPORTS: runStartupIngestion, shouldReIngest
```

### `src/lib/rag.ts`  ← CLIENT-SIDE PROXY
```
→ (fetch — no local imports)
← src/App.tsx (ragSearch)
← src/components/QueryInput.tsx (ragIngestBulk)
← src/lib/chat-tools.ts (ragSearch, ragCreateDocument)
← src/lib/browser-agent.ts (ragIngestText, ragSearch)
EXPORTS: ragSearch, ragIngest, ragIngestBulk, ragIngestText, ragCreateDocument
WIRE: POST /api/rag/* → electron/main.cjs → electron/rag-db.cjs
```

---

## 10. MEMORY

### `src/memory/sessionIndex.ts`
```
→ @/lib/secure-random (randomIdSegment)
← src/agents/managerAgent.ts
← src/agents/managerWorkerOrchestrator.ts
← src/orchestrator.ts
← src/rag/retrievalGate.ts
← src/lib/prompts/promptRegressionTests.ts
EXPORTS: SessionIndex, SessionIndexOptions
```

---

## 11. REASONING ENGINES

### `src/reasoning/reactEngine.ts`
```
→ uuid
→ ./thoughtGenerator (ThoughtGenerator, ThoughtContext)
→ ./hypothesisTracker (HypothesisTracker)
→ ./observationEvaluator (ObservationEvaluator, ActionOutcome)
→ ./modelRouter (modelRouter, RouterResult)
→ ./totOrchestrator (ToTOrchestrator, ToTDecision)
→ ./confidenceMemoryStore (confidenceMemoryStore)
→ ./confidenceOrchestrator (confidenceOrchestrator)
→ ./scratchpadStore (scratchpadStore)
→ ./reactTypes (all types, MAX_REACT_STEPS, THOUGHT_CONFIDENCE_THRESHOLD)
→ @/lib/observability/telemetryCollector (telemetry)
← ./reactLoopController.ts
EXPORTS: ReActEngine
```

### `src/reasoning/reactLoopController.ts`
```
→ uuid
→ ./reactEngine (ReActEngine)
→ ./reactTypes (ReActTrace, Thought, Observation, ReActStep, Action — types)
→ ./observationEvaluator (ActionOutcome — type)
→ ./thoughtGenerator (ThoughtContext — type)
→ @/lib/observability/telemetryCollector (telemetry)
← src/agents/managerAgent.ts
← src/agents/managerWorkerOrchestrator.ts
EXPORTS: ReActLoopController, LoopResult
```

### `src/reasoning/reactTypes.ts`
```
→ (no imports)
← reactEngine.ts, reactLoopController.ts, observationEvaluator.ts, thoughtGenerator.ts, etc.
EXPORTS: ReActTrace, Thought, ThoughtType, Observation, ObservationStatus, Action, ReActStep, MAX_REACT_STEPS, THOUGHT_CONFIDENCE_THRESHOLD
```

### `src/reasoning/reflexionController.ts`
```
→ uuid
→ ./criticAgent (CriticAgent, CritiqueRequest, Critique)
→ ./lessonsStore (lessonsStore, Lesson)
→ ./scratchpadStore (scratchpadStore)
→ @/lib/observability/telemetryCollector (telemetry)
← src/agents/managerWorkerOrchestrator.ts
EXPORTS: ReflexionController, ReflexionResult, MAX_REFLEXION_ITERATIONS
```

### `src/reasoning/totOrchestrator.ts`
```
→ @/lib/observability/telemetryCollector (telemetry)
→ ./branchScorer (ScoringContext — type)
→ ./beamSearchController (BeamSearchController)
→ ./complexityDetector (ComplexityDetector)
→ ./scratchpadStore (scratchpadStore)
→ ./totTypes (createTree, ToTResult, ToTTree, TotConfigDefaults)
← ./reactEngine.ts
EXPORTS: ToTOrchestrator, ToTDecision
```

### `src/reasoning/beamSearchController.ts`
```
→ @/lib/observability/telemetryCollector (telemetry)
→ ./branchGenerator (BranchGenerator)
→ ./branchScorer (BranchScorer, ScoringContext)
→ ./totTypes (all ToT types)
← ./totOrchestrator.ts
EXPORTS: BeamSearchController, ToTResult
```

### `src/reasoning/branchGenerator.ts`
```
→ openai
→ ./cotScratchpad (buildScratchpadSummary)
→ ./scratchpadStore (scratchpadStore)
→ ./totTypes (ThoughtNode, ToTTree)
← ./beamSearchController.ts
EXPORTS: BranchGenerator
```

### `src/reasoning/branchScorer.ts`
```
→ openai
→ ./lessonsStore (Lesson, lessonsStore)
→ ./totTypes (getNodePath, ThoughtNode, ToTTree)
→ ./scratchpadStore (scratchpadStore)
← ./beamSearchController.ts
EXPORTS: BranchScorer, ScoringContext
```

### `src/reasoning/totTypes.ts`
```
→ uuid
← totOrchestrator.ts, beamSearchController.ts, branchGenerator.ts, branchScorer.ts
EXPORTS: ThoughtNode, ToTTree, ToTResult, TotConfigDefaults, createTree, getNodePath
```

### `src/reasoning/thoughtGenerator.ts`
```
→ openai, uuid
→ @/reasoning/modelRouter (modelRouter)
→ ./cotScratchpad (buildScratchpadSummary)
→ ./scratchpadStore (scratchpadStore)
→ ./modelRegistry (ModelTier — type)
→ ./reactTypes (Thought, ThoughtType, ReActStep)
← ./reactEngine.ts
EXPORTS: ThoughtGenerator, ThoughtContext
```

### `src/reasoning/hypothesisTracker.ts`
```
→ openai
→ ./cotScratchpad (CoTScratchpad, Hypothesis)
→ ./scratchpadStore (scratchpadStore)
← ./reactEngine.ts
EXPORTS: HypothesisTracker
```

### `src/reasoning/observationEvaluator.ts`
```
→ openai, uuid
→ ./reactTypes (Observation, ObservationStatus, Thought, Action)
← ./reactEngine.ts
EXPORTS: ObservationEvaluator, ActionOutcome
```

### `src/reasoning/problemDecomposer.ts`
```
→ openai, uuid
→ ./cotScratchpad (Assumption, SubGoal)
→ ./scratchpadStore (scratchpadStore)
← src/agents/managerAgent.ts
EXPORTS: ProblemDecomposer
```

### `src/reasoning/criticAgent.ts`
```
→ openai, uuid
← ./reflexionController.ts
EXPORTS: CriticAgent, CritiqueRequest, Critique, CritiqueIssue
```

### `src/reasoning/cotScratchpad.ts`
```
→ uuid
← scratchpadStore.ts, branchGenerator.ts, thoughtGenerator.ts, hypothesisTracker.ts, problemDecomposer.ts, managerAgent.ts
EXPORTS: CoTScratchpad, Hypothesis, SubGoal, Assumption, buildScratchpadSummary, getActiveSubGoal,
         createScratchpad, getNextPendingSubGoal, updateScratchpad
```

### `src/reasoning/scratchpadStore.ts`
```
→ uuid
→ ./cotScratchpad (createScratchpad, getNextPendingSubGoal, updateScratchpad, CoTScratchpad)
→ @/lib/observability/telemetryCollector (telemetry)
← reactEngine.ts, totOrchestrator.ts, branchGenerator.ts, branchScorer.ts, thoughtGenerator.ts,
  hypothesisTracker.ts, problemDecomposer.ts, modelRouter.ts, uncertaintyResolver.ts, managerAgent.ts
EXPORTS: scratchpadStore (singleton)
```

### `src/reasoning/modelRouter.ts`
```
→ @/lib/observability/telemetryCollector (telemetry)
→ ./costTracker (costTracker, DEFAULT_BUDGET, SessionCostSummary)
→ ./modelRegistry (ModelTier, ROUTING_RULES, estimateCost, getModelSpec)
→ ./routingClassifier (RoutingClassifier)
→ ./scratchpadStore (scratchpadStore)
← src/agents/workerAgent.ts
← src/reasoning/thoughtGenerator.ts
← src/reasoning/uncertaintyResolver.ts
EXPORTS: modelRouter (singleton), RouterResult
```

### `src/reasoning/routingClassifier.ts`
```
→ openai
→ ./complexityDetector (ComplexityAssessment — type)
→ ./cotScratchpad (CoTScratchpad — type)
→ ./modelRegistry (ModelSpec, ModelTier, MODEL_REGISTRY, ROUTING_RULES, estimateCost, getModelSpec)
← ./modelRouter.ts
EXPORTS: RoutingClassifier, RoutingSignals
```

### `src/reasoning/complexityDetector.ts`
```
→ openai
→ ./cotScratchpad (CoTScratchpad — type)
← ./totOrchestrator.ts, managerWorkerOrchestrator.ts
EXPORTS: ComplexityDetector, ComplexityAssessment
```

### `src/reasoning/modelRegistry.ts`
```
→ (no imports)
← modelRouter.ts, routingClassifier.ts, costTracker.ts, thoughtGenerator.ts, uncertaintyResolver.ts
EXPORTS: MODEL_REGISTRY, ROUTING_RULES, ModelSpec, ModelTier, estimateCost, getModelSpec
```

### `src/reasoning/costTracker.ts`
```
→ uuid
→ @/lib/observability/telemetryCollector (telemetry)
→ ./modelRegistry (ModelTier, MODEL_REGISTRY, estimateCost)
← ./modelRouter.ts
EXPORTS: costTracker (singleton), SessionCostSummary, DEFAULT_BUDGET
```

### `src/reasoning/confidenceTypes.ts`
```
→ (no imports)
← confidenceElicitor.ts, confidenceMemoryStore.ts, confidenceOrchestrator.ts, uncertaintyResolver.ts
← src/lib/observability/telemetryCollector.ts
EXPORTS: ConfidenceScore, ConfidenceVector, ConfidenceLevel, ConfidenceAction, CONFIDENCE_THRESHOLDS,
         scoreToLevel, scoreToAction, PreTaskEstimate, UncertaintyMemory, ELICITATION_INSTRUCTION
```

### `src/reasoning/confidenceElicitor.ts`
```
→ openai, uuid
→ ./confidenceTypes (ConfidenceScore, ConfidenceVector, PreTaskEstimate)
← ./confidenceOrchestrator.ts
← src/agents/managerWorkerOrchestrator.ts
EXPORTS: ConfidenceElicitor, PreTaskEstimate
```

### `src/reasoning/confidenceMemoryStore.ts`
```
→ @/lib/observability/telemetryCollector (telemetry)
→ ./confidenceTypes (ConfidenceScore, UncertaintyMemory, ConfidenceLevel, CONFIDENCE_THRESHOLDS, scoreToLevel)
← ./reactEngine.ts, ./confidenceOrchestrator.ts, managerWorkerOrchestrator.ts
EXPORTS: confidenceMemoryStore (singleton)
```

### `src/reasoning/confidenceOrchestrator.ts`
```
→ ./confidenceElicitor (ConfidenceElicitor)
→ ./confidenceMemoryStore (confidenceMemoryStore)
→ ./confidenceTypes (ConfidenceScore, CONFIDENCE_THRESHOLDS, scoreToAction, scoreToLevel)
→ ./uncertaintyResolver (UncertaintyResolver, UARResult)
← src/agents/workerAgent.ts
← src/agents/managerWorkerOrchestrator.ts
← src/reasoning/reactEngine.ts
EXPORTS: confidenceOrchestrator (singleton), ConfidenceScore
```

### `src/reasoning/uncertaintyResolver.ts`
```
→ openai
→ ./confidenceTypes (ConfidenceScore, ConfidenceVector, ConfidenceAction, CONFIDENCE_THRESHOLDS)
→ ./lessonsStore (lessonsStore)
→ ./modelRouter (modelRouter)
→ ./modelRegistry (ModelTier — type)
→ ./scratchpadStore (scratchpadStore)
← ./confidenceOrchestrator.ts
EXPORTS: UncertaintyResolver, UARResult
```

### `src/reasoning/lessonsStore.ts`
```
→ uuid
→ @/lib/persistence/lessonsPersistenceAdapter (Lesson persistence)
→ ./criticAgent (Critique, CritiqueIssue — types)
← reflexionController.ts, branchScorer.ts, uncertaintyResolver.ts, managerWorkerOrchestrator.ts, workerAgent.ts
EXPORTS: lessonsStore (singleton), Lesson
```

### `src/reasoning/confidenceMemoryStore.ts` (see above)

### `src/reasoning/hypothesisTracker.ts` (see above)

---

## 12. LIB — CORE

### `src/lib/llm.ts`
```
→ (fetch only — no local imports)
← advice-generator.ts, hallucination-guard.ts, learning-engine.ts, proactive-vision.ts,
   lib/browser-agent.ts, lib/chat-tools.ts (via runToolLoop)
EXPORTS: callLlm, callLlmStream, callLlmWithTools, callLlmChat, runToolLoop, llmPrompt, LlmToolMessage
WIRE: POST /api/llm → electron/main.cjs proxy → OpenAI or DigitalOcean
```

### `src/lib/api.ts`
```
→ ./llm (callLlm, llmPrompt)
→ ./types (Source, FocusMode)
← src/App.tsx
← src/lib/chat-tools.ts (executeWebSearch)
EXPORTS: executeWebSearch, generateFollowUpQuestions, executeModelCouncil, Source
WIRE: POST /api/search/tavily → electron/main.cjs proxy → Tavily API
```

### `src/lib/types.ts`
```
→ @/lib/voice/types (VoiceTurn — type)
← App.tsx, components, hooks, many lib files (most-imported file)
EXPORTS: FocusMode, AvailableModel, Message, Thread, Workspace, Source, UploadedFile,
         WorkspaceFile, UserSettings, CloudFile, A2EMediaType, A2EModelId, A2ETask, VoiceTurn
```

### `src/lib/utils.ts`
```
→ clsx, tailwind-merge
← 74+ files (most-imported utility)
EXPORTS: cn (classname merge)
```

### `src/lib/defaults.ts`
```
→ ./types (UserSettings)
← App.tsx, VoiceMode.tsx, SettingsDialog.tsx, ProactiveVisionLoop.tsx
EXPORTS: DEFAULT_USER_SETTINGS
```

### `src/lib/helpers.ts`
```
→ ./types (UploadedFile)
→ @/lib/secure-random (randomIdSegment)
← App.tsx, AppSidebar.tsx, QueryInput.tsx
EXPORTS: generateId, generateThreadTitle, processFile, formatTimestamp
```

### `src/lib/contextInjector.ts`
```
→ ./contextCompactor (ConversationTurn)
→ @/lib/prompts/promptAssembler (assembleSystemPrompt)
→ ./tokenCounter (countTokens)
← src/orchestrator.ts
EXPORTS: assembleContext, AssembledContext, InjectionContext
```

### `src/lib/contextCompactor.ts`
```
→ ./tokenCounter (countMessageTokens, FULL_FIDELITY_TURNS, TOKEN_LIMITS, getTokenBudget)
← src/orchestrator.ts, src/lib/contextInjector.ts
EXPORTS: ConversationTurn, compactContext
```

### `src/lib/tokenCounter.ts`
```
→ tiktoken (encoding_for_model, Tiktoken, TiktokenModel)
← contextCompactor.ts, contextInjector.ts, workerAgent.ts, orchestrator.ts
EXPORTS: countTokens, countMessageTokens, TOKEN_LIMITS, FULL_FIDELITY_TURNS, getTokenBudget
```

### `src/lib/toolLoader.ts`
```
→ (no local imports — tool spec registry)
← src/agents/workerAgent.ts
← src/orchestrator.ts
← src/lib/prompts/promptRegressionTests.ts
EXPORTS: loadToolsForIntent, formatToolsForOpenAI, OpenAiToolSpec
```

### `src/lib/thinking-engine.ts`
```
→ (no local imports)
← src/App.tsx (classifyComplexity)
← src/hooks/useRealtimeVoice.ts (getVoiceThinkingPrompt)
← src/lib/jarvis-tool-system-prompt.ts (getThinkingPrompt)
EXPORTS: classifyComplexity, ThinkingDepth, getThinkingPrompt, getVoiceThinkingPrompt
```

### `src/lib/thinking-tags.ts`
```
→ (no imports)
← src/lib/chat-tools.ts
EXPORTS: splitThinkingFromModelContent, ThinkingResult
```

### `src/lib/learning-engine.ts`
```
→ ./llm (callLlm)
← src/App.tsx (getLearnedContext)
← src/hooks/useRealtimeVoice.ts
← src/lib/chat-tools.ts
EXPORTS: analyzeExchangeAsync, getLearnedContext, getLearningStats, trackToolOutcome
```

### `src/lib/hallucination-guard.ts`
```
→ ./llm (callLlm)
← src/hooks/useRealtimeVoice.ts (quickScan)
← src/lib/chat-tools.ts (validateResponse)
EXPORTS: validateResponse, quickScan, getAntiHallucinationPrompt
```

### `src/lib/browser-agent.ts`
```
→ @/contexts/BrowserControlContext (BrowserControl — type)
→ ./llm (callLlmWithTools, LlmToolMessage)
→ ./rag (ragIngestText, ragSearch)
← src/hooks/useRealtimeVoice.ts (runBrowserAgent)
← src/lib/chat-tools.ts (runBrowserAgent)
EXPORTS: runBrowserAgent
```

### `src/lib/chat-tools.ts`  ← MEGA-INTEGRATION FILE
```
→ @/contexts/BrowserControlContext (BrowserControl — type)
→ @/contexts/MediaCanvasContext (MediaCanvasControl — type)
→ @/contexts/CodeEditorContext (CodeEditorControl — type)
→ @/contexts/MusicPlayerContext (MusicPlayerControl — type)
→ ./llm (runToolLoop, LlmToolMessage)
→ ./browser-agent (runBrowserAgent)
→ ./rag (ragSearch, ragCreateDocument)
→ ./api (executeWebSearch)
→ ./media-api (generateImage, editImage, createVideo)
→ ./hf-api (searchHuggingFace, fetchDatasetSample)
→ ./github-api (searchGitHub, fetchGitHubFile)
→ ./suno-api (generateMusic)
→ ./code-runner (runCode)
→ ./plaid-api (getBalances, getTransactions, getSpendingSummary)
→ ./story-api (searchStories, getStoryContent, getRandomStory, continueReading, jumpToPage, getCurrentBook)
→ ./social-api (postTweet, readSocialFeed, readComments, replyViaBrowser)
→ ./email-api (emailListInbox, emailReadMessage, emailSend, emailSearch, emailListFolders, emailMove, emailDelete, emailMarkRead)
→ ./google-calendar (ensureGoogleAccessToken, listCalendarEvents, createCalendarEvent, updateCalendarEvent, deleteCalendarEvent, listCalendars, formatEventTime)
→ ./google-drive (driveListFiles, driveSearchFiles, driveReadFile, driveCreateFile, driveCreateFolder, driveMoveFile, driveRenameFile, driveDeleteFile, formatDriveFile)
→ ./onedrive-api (ensureOneDriveAccessToken, onedriveListFiles, onedriveSearchFiles, onedriveReadFile, onedriveCreateFile, onedriveCreateFolder, onedriveMoveFile, onedriveRenameFile, onedriveDeleteFile, formatOneDriveFile)
→ ./vonage-api (vonageAiVoiceCall, vonageSendSms, vonageVoiceCall)
→ ./types (UserSettings — type)
→ ./social-scheduler (schedulePost, listScheduledPostsSummary, cancelScheduledPost)
→ ./hallucination-guard (validateResponse)
→ ./thinking-tags (splitThinkingFromModelContent)
→ ./learning-engine (trackToolOutcome, analyzeExchangeAsync, getLearningStats)
→ ./chat-tools-desktop-automation-tools (DESKTOP_AUTOMATION_TOOLS)
→ ./desktop-automation-tool-runner (runDesktopAutomationTool)
→ ./tts (playTts, getEffectiveTtsVoice)
← src/App.tsx (runChatWithTools)
EXPORTS: runChatWithTools
```

### `src/lib/secure-random.ts`
```
→ (crypto API — no local imports)
← @/memory/sessionIndex.ts, @/lib/helpers.ts, @/browser/JarvisBrowserShell.tsx, @/lib/social-scheduler.ts
EXPORTS: randomIdSegment
```

### `src/lib/oauth.ts`
```
→ (fetch — no local imports)
← @/lib/google-calendar.ts, @/lib/onedrive-api.ts, @/lib/spotify-api.ts, @/lib/spotify-oauth.ts
← @/lib/cloudServices.ts, @/components/SettingsDialog.tsx
EXPORTS: buildAuthUrl, isTokenExpired, refreshAccessToken, generateOAuthState, OAuthToken
```

### `src/lib/proactive-vision.ts`
```
→ @/lib/llm (callLlmChat)
→ @/lib/jarvis-native-bridge (getJarvisNative)
← @/components/ProactiveVisionLoop.tsx
EXPORTS: runProactiveVisionObservation, parseProactiveSuggestion
```

### `src/lib/ip-approx-location.ts`
```
→ (fetch — no local imports)
← (internal geolocation fallback)
EXPORTS: getApproxLocation
```

### `src/lib/sanitize-do-token.ts`
```
→ (no imports)
← @/lib/digitalocean-api.ts
EXPORTS: sanitizeDoToken
```

### `src/lib/code-runner.ts`
```
→ @/contexts/CodeEditorContext (CodeRunResult — type)
← @/lib/chat-tools.ts, @/hooks/useRealtimeVoice.ts
EXPORTS: runCode
```

### `src/lib/healthDashboardAccess.ts`
```
→ (no imports)
← src/App.tsx
EXPORTS: canAccessHealthDashboard, HEALTH_DASHBOARD_403_FLAG
```

---

## 13. LIB — OBSERVABILITY, ROUTER, PROMPTS

### `src/lib/observability/telemetryCollector.ts`
```
→ uuid
→ @/reasoning/confidenceTypes (CONFIDENCE_THRESHOLDS)
← reasoning engines (16 files emit telemetry events)
← src/agents/managerWorkerOrchestrator.ts
← src/lib/observability/alertSystem.ts
EXPORTS: telemetry (singleton), TelemetryCollector, TelemetryEvent, SessionSummary
```

### `src/lib/observability/alertSystem.ts`
```
→ @/lib/prompts/promptRegistry (promptRegistry)
→ ./telemetryCollector (TelemetryCollector, telemetry, SessionSummary)
← src/orchestrator.ts
EXPORTS: alertSystem (singleton), Alert, SystemStatsSnapshot
```

### `src/lib/router/utteranceLibrary.ts`
```
→ (no imports — data only)
← ./semanticRouter.ts
EXPORTS: ROUTE_DEFINITIONS, addUtterancesToRoute, getRouteByName, RouteDefinition
```

### `src/lib/router/overrideRules.ts`
```
→ (no imports — data only)
← ./semanticRouter.ts, src/orchestrator.ts, src/lib/prompts/promptRegressionTests.ts
EXPORTS: applyOverrides
```

### `src/lib/router/routeCache.ts`
```
→ (no imports — cache singleton)
← src/orchestrator.ts
EXPORTS: routeCache
```

### `src/lib/router/semanticRouter.ts`
```
→ ./utteranceLibrary (addUtterancesToRoute, getRouteByName, ROUTE_DEFINITIONS, RouteDefinition)
→ ./overrideRules (applyOverrides)
← src/orchestrator.ts
← src/lib/prompts/promptRegressionTests.ts
EXPORTS: semanticRouter, RouteResult
```

### `src/lib/prompts/promptValidator.ts`
```
→ (no imports)
← promptAssembler.ts, promptRegistry.ts
EXPORTS: validatePrompt, assertValidPrompt
```

### `src/lib/prompts/promptRegistry.ts`
```
→ node:fs, node:path, uuid
→ @/lib/prompts/promptValidator (assertValidPrompt, validatePrompt)
← promptAssembler.ts, promptExperiments.ts, src/lib/observability/alertSystem.ts, src/orchestrator.ts
EXPORTS: promptRegistry (singleton), PromptVersion
```

### `src/lib/prompts/promptAssembler.ts`
```
→ ./promptRegistry (promptRegistry)
→ ./promptValidator (assertValidPrompt, validatePrompt)
← src/orchestrator.ts, src/lib/contextInjector.ts
EXPORTS: assembleSystemPrompt
```

### `src/lib/prompts/promptExperiments.ts`
```
→ uuid
→ ./promptRegistry (promptRegistry, PromptVersion)
← src/orchestrator.ts
EXPORTS: promptExperiments (singleton)
```

### `src/lib/prompts/promptRegressionTests.ts`
```
→ @/memory/sessionIndex (SessionIndex)
→ @/rag/retrievalGate (RetrievalGate, LongTermIndex)
→ @/lib/router/overrideRules (applyOverrides)
→ @/lib/router/semanticRouter (semanticRouter)
→ @/lib/toolLoader (loadToolsForIntent)
← src/orchestrator.ts (runBlockerTestsOnly)
EXPORTS: runBlockerTestsOnly, validatePrompt
```

---

## 14. LIB — EXTERNAL API INTEGRATIONS

### `src/lib/media-api.ts`
```
→ (fetch — no local imports)
← @/lib/chat-tools.ts, @/hooks/useRealtimeVoice.ts
EXPORTS: generateImage, editImage, createVideo
WIRE: POST /api/generate-image, /api/generate-video → electron/main.cjs
```

### `src/lib/a2e-api.ts`
```
→ @/lib/types (A2EMediaType, A2EModelId, A2ETask, UploadedFile)
→ @/lib/a2e-streaming (A2E_STREAMING_API_ROOT, A2E_STREAMING_HELP, getA2eStreamingConsoleUrl)
→ @/lib/a2e-http (A2E HTTP helpers)
← @/components/A2EStudioPanel.tsx, @/components/A2ECommandCenter.tsx
EXPORTS: A2E_MODELS, startA2ETask, pollA2ETask, etc.
```

### `src/lib/a2e-streaming.ts`
```
→ (env vars — no local imports)
← @/lib/a2e-api.ts
EXPORTS: A2E_STREAMING_API_ROOT, A2E_STREAMING_HELP, getA2eStreamingConsoleUrl
```

### `src/lib/a2e-http.ts`
```
→ (fetch — no local imports)
← @/lib/a2e-api.ts
EXPORTS: a2eRequest, buildA2eUrl, parseA2eError
```

### `src/lib/a2e-download.ts`
```
→ @/lib/types (A2ETask)
→ sonner (toast)
← @/components/A2EStudioPanel.tsx, @/components/A2EMediaResult.tsx
EXPORTS: downloadA2EResult
```

### `src/lib/github-api.ts`
```
→ (fetch — no local imports)
← @/lib/chat-tools.ts, @/hooks/useRealtimeVoice.ts
EXPORTS: searchGitHub, fetchGitHubFile
```

### `src/lib/google-calendar.ts`
```
→ @/lib/types (UserSettings — type)
→ @/lib/oauth (isTokenExpired, refreshAccessToken)
← @/lib/chat-tools.ts
EXPORTS: ensureGoogleAccessToken, listCalendarEvents, createCalendarEvent, updateCalendarEvent,
         deleteCalendarEvent, listCalendars, formatEventTime, NewCalendarEvent
```

### `src/lib/google-drive.ts`
```
→ (fetch — no local imports)
← @/lib/chat-tools.ts
EXPORTS: driveListFiles, driveSearchFiles, driveReadFile, driveCreateFile, driveCreateFolder,
         driveMoveFile, driveRenameFile, driveDeleteFile, formatDriveFile
```

### `src/lib/onedrive-api.ts`
```
→ @/lib/types (UserSettings — type)
→ @/lib/oauth (isTokenExpired, refreshAccessToken)
← @/lib/chat-tools.ts
EXPORTS: ensureOneDriveAccessToken, onedriveListFiles, onedriveSearchFiles, onedriveReadFile,
         onedriveCreateFile, onedriveCreateFolder, onedriveMoveFile, onedriveRenameFile,
         onedriveDeleteFile, formatOneDriveFile
```

### `src/lib/hf-api.ts`
```
→ (fetch — no local imports)
← @/lib/chat-tools.ts, @/hooks/useRealtimeVoice.ts
EXPORTS: searchHuggingFace, fetchDatasetSample
```

### `src/lib/email-api.ts`
```
→ (fetch — no local imports)
← @/lib/chat-tools.ts, @/hooks/useRealtimeVoice.ts
EXPORTS: emailListInbox, emailReadMessage, emailSend, emailSearch, emailListFolders,
         emailMove, emailDelete, emailMarkRead
WIRE: fetch → electron/main.cjs IMAP proxy (imapflow)
```

### `src/lib/social-api.ts`
```
→ @/contexts/BrowserControlContext (BrowserControl — type)
← @/lib/chat-tools.ts, @/hooks/useRealtimeVoice.ts, @/lib/social-scheduler.ts
EXPORTS: postTweet, readSocialFeed, readComments, replyViaBrowser
```

### `src/lib/social-scheduler.ts`
```
→ @/lib/secure-random (randomIdSegment)
→ ./social-api (postTweet)
← src/App.tsx (checkAndFireScheduled)
← @/lib/chat-tools.ts, @/hooks/useRealtimeVoice.ts
EXPORTS: schedulePost, listScheduledPostsSummary, cancelScheduledPost, checkAndFireScheduled
```

### `src/lib/story-api.ts`
```
→ (fetch — no local imports)
← @/lib/chat-tools.ts, @/hooks/useRealtimeVoice.ts
EXPORTS: searchStories, getStoryContent, getRandomStory, continueReading, jumpToPage, getCurrentBook
```

### `src/lib/suno-api.ts`
```
→ (fetch — no local imports)
← @/lib/chat-tools.ts, @/hooks/useRealtimeVoice.ts
EXPORTS: generateMusic
WIRE: POST /api/suno → electron/main.cjs
```

### `src/lib/plaid-api.ts`
```
→ (fetch — no local imports)
← @/lib/chat-tools.ts, @/hooks/useRealtimeVoice.ts
EXPORTS: getBalances, getTransactions, getSpendingSummary
WIRE: POST /api/plaid/* → electron/main.cjs → Plaid API
```

### `src/lib/spotify-api.ts`
```
→ @/lib/oauth (isTokenExpired)
→ @/lib/spotify-oauth (refreshSpotifyAccessToken)
→ @/lib/types (OAuthToken, UserSettings)
← @/components/modules/MediaPlayerModule.tsx
EXPORTS: spotifyPlay, spotifyPause, spotifySearch, etc.
```

### `src/lib/spotify-oauth.ts`
```
→ @/lib/oauth (generateOAuthState)
→ @/lib/types (OAuthToken)
← @/lib/spotify-api.ts
EXPORTS: refreshSpotifyAccessToken, buildSpotifyAuthUrl
```

### `src/lib/digitalocean-api.ts`
```
→ @/lib/sanitize-do-token (sanitizeDoToken)
→ @/lib/types (UserSettings — type)
← @/hooks/useDigitalOceanCatalogEnabled.ts, @/components/QueryInput.tsx
EXPORTS: listDigitalOceanModels, DO model types
```

### `src/lib/cloudServices.ts`
```
→ ./oauth (OAuthToken)
→ ./types (CloudFile)
← @/components/CloudFileBrowser.tsx
EXPORTS: CloudFile, listCloudFiles, fetchCloudFile, cloud provider types
```

### `src/lib/tunein.ts`
```
→ @/lib/tunein-world-seeds (WORLD_RADIO_SEARCH_SEEDS)
← @/components/modules/TuneInModuleCard.tsx
EXPORTS: searchTuneIn, getTuneInEmbed, TUNEIN_PRESETS
```

### `src/lib/tunein-world-seeds.ts`
```
→ (no imports — data only)
← @/lib/tunein.ts
EXPORTS: WORLD_RADIO_SEARCH_SEEDS
```

---

## 15. LIB — DESKTOP & JARVIS CAPABILITIES

### `src/lib/desktop-automation-tool-runner.ts`
```
→ @/lib/jarvis-native-bridge (getJarvisNative)
→ @/lib/desktop-automation-guard (validatePowerShellCommand, validateNativeClick, validateNativeToolPre)
← @/lib/chat-tools.ts, @/hooks/useRealtimeVoice.ts
EXPORTS: runDesktopAutomationTool, desktopAutomationChatSpecToRealtime
```

### `src/lib/chat-tools-desktop-automation-tools.ts`
```
→ (no local imports — tool spec data)
← @/lib/chat-tools.ts, @/hooks/useRealtimeVoice.ts
EXPORTS: DESKTOP_AUTOMATION_TOOLS
```

### `src/lib/jarvis-desktop-os-capabilities.ts`
```
→ (no local imports — string builders)
← @/hooks/useRealtimeVoice.ts
EXPORTS: getJarvisVoiceDesktopOsHintSection, getJarvisDesktopOsCapabilitiesPromptSection
```

### `src/lib/jarvis-native-bridge.ts`
```
→ (window.electronAPI — no local imports)
← @/lib/desktop-automation-tool-runner.ts, @/lib/proactive-vision.ts, @/components/ProactiveVisionLoop.tsx
EXPORTS: getJarvisNative, JarvisNativeBridge
```

### `src/lib/jarvis-ide-bridge.ts`
```
→ @/types/jarvis-ide (JarvisIdeRunCommandResult)
← @/contexts/CodeEditorContext.tsx
EXPORTS: jarvisIdeBridge, JarvisIdeBridge
```

### `src/lib/jarvis-ide-chat-types.ts`
```
→ (no imports)
← src/App.tsx
EXPORTS: IdeChatPayload, presetToInstruction
```

### `src/lib/jarvis-tool-system-prompt.ts`
```
→ @/lib/hallucination-guard (getAntiHallucinationPrompt)
→ @/lib/jarvis-inline-editor-micro (getJarvisInlineEditorMicroPromptSection)
→ @/lib/jarvis-inline-highlighting (getJarvisInlineHighlightingPromptSection)
→ @/lib/jarvis-ai-editing-core-intelligence (getJarvisAiEditingCoreIntelligencePromptSection)
→ @/lib/jarvis-browser-micro-functions (getJarvisBrowserMicroFunctionsPromptSection)
→ @/lib/jarvis-agent-system-capabilities (getJarvisAgentSystemCapabilitiesPromptSection)
→ @/lib/jarvis-desktop-os-capabilities (getJarvisDesktopOsCapabilitiesPromptSection)
→ @/lib/jarvis-composer-capabilities (getJarvisComposerCapabilitiesPromptSection)
→ @/lib/jarvis-settings-capabilities (getJarvisSettingsCapabilitiesPromptSection)
→ @/lib/thinking-engine (getThinkingPrompt, ThinkingDepth)
← src/App.tsx
EXPORTS: buildJarvisToolSystemPrompt
```

### `src/lib/jarvis-explorer-badges.ts`
```
→ @/lib/jarvis-missing-logic-detector (MissingLogicDetectionId, MISSING_LOGIC_BADGE_DEFS, missingLogicDetectionBadgeId)
← @/contexts/CodeEditorContext.tsx
EXPORTS: JarvisExplorerFileMeta, badge definitions
```

### Prompt Section Builders (no imports, string-only)
```
src/lib/jarvis-inline-editor-micro.ts      → EXPORTS: getJarvisInlineEditorMicroPromptSection
src/lib/jarvis-inline-highlighting.ts      → EXPORTS: getJarvisInlineHighlightingPromptSection
src/lib/jarvis-ai-editing-core-intelligence.ts → EXPORTS: getJarvisAiEditingCoreIntelligencePromptSection
src/lib/jarvis-browser-micro-functions.ts  → EXPORTS: getJarvisBrowserMicroFunctionsPromptSection
src/lib/jarvis-agent-system-capabilities.ts → EXPORTS: getJarvisAgentSystemCapabilitiesPromptSection
src/lib/jarvis-composer-capabilities.ts    → EXPORTS: getJarvisComposerCapabilitiesPromptSection
src/lib/jarvis-settings-capabilities.ts    → EXPORTS: getJarvisSettingsCapabilitiesPromptSection
src/lib/browser-agent-scripts.ts           → EXPORTS: browser injection scripts
src/lib/jarvis-missing-logic-detector.ts   → EXPORTS: MISSING_LOGIC_BADGE_DEFS, missingLogicDetectionBadgeId
```

---

## 16. LIB — PERSISTENCE

### `src/lib/persistence/sessionPersistenceAdapter.ts`
```
→ node:fs, node:path
← src/orchestrator.ts
EXPORTS: PersistedSession, readSession, writeSession
```

### `src/lib/persistence/lessonsPersistenceAdapter.ts`
```
→ node:fs, node:path, node:module (createRequire — better-sqlite3)
← src/reasoning/lessonsStore.ts
EXPORTS: Lesson (row type), loadLessons, saveLessons
```

---

## 17. CONTEXTS (REACT STATE)

### `src/contexts/TuneInControlContext.tsx`
```
→ react (createContext, useCallback, useContext, useMemo, useRef, ReactNode)
← src/App.tsx (TuneInControlProvider)
← src/hooks/useRealtimeVoice.ts (TuneInControl — type)
← src/components/VoiceMode.tsx (useTuneInControl)
← src/components/modules/TuneInModuleCard.tsx
EXPORTS: TuneInControlProvider, useTuneInControl, TuneInControl
```

### `src/contexts/BrowserControlContext.tsx`
```
→ react (createContext, useCallback, useContext, useMemo, useRef, useState, ReactNode)
← src/App.tsx (BrowserControlProvider, useBrowserControl, useBrowserGuideMode)
← src/hooks/useRealtimeVoice.ts (BrowserControl — type)
← src/components/VoiceMode.tsx (useBrowserControl, useBrowserGuideMode, useBrowserAutomating, useBrowserAgentSteps)
← src/components/AppSidebar.tsx (useBrowserGuideMode)
← src/lib/browser-agent.ts (BrowserControl — type)
← src/lib/social-api.ts (BrowserControl — type)
← src/browser/JarvisBrowserShell.tsx
EXPORTS: BrowserControlProvider, useBrowserControl, useBrowserGuideMode, useBrowserAutomating,
         useBrowserAgentSteps, BrowserControl
```

### `src/contexts/MediaCanvasContext.tsx`
```
→ react (createContext, useCallback, useContext, useMemo, useRef, useState, ReactNode)
← src/App.tsx (MediaCanvasProvider, useMediaCanvas, useMediaCanvasGenerating)
← src/hooks/useRealtimeVoice.ts (MediaCanvasControl — type)
← src/components/VoiceMode.tsx (useMediaCanvas, useMediaCanvasGenerating)
EXPORTS: MediaCanvasProvider, useMediaCanvas, useMediaCanvasGenerating, MediaCanvasControl
```

### `src/contexts/CodeEditorContext.tsx`
```
→ react (createContext, useCallback, useMemo, useState, ReactNode)
→ @/lib/jarvis-explorer-badges (JarvisExplorerFileMeta)
→ @/types/jarvis-ide (JarvisIdeRunCommandResult)
← src/App.tsx (CodeEditorProvider)
← src/hooks/useRealtimeVoice.ts (CodeEditorControl — type)
← src/contexts/useCodeEditorHooks.ts
← src/lib/code-runner.ts (CodeRunResult — type)
EXPORTS: CodeEditorProvider, CodeEditorContext, CodeEditorControl, CodeRunResult
```

### `src/contexts/useCodeEditorHooks.ts`
```
→ react (useContext)
→ ./CodeEditorContext (CodeEditorContext, CodeEditorControl)
← src/App.tsx (useCodeEditor)
← src/components/VoiceMode.tsx (useCodeEditor)
EXPORTS: useCodeEditor
```

### `src/contexts/MusicPlayerContext.tsx`
```
→ react (createContext, useCallback, useContext, useMemo, useRef, useState, ReactNode)
← src/App.tsx (MusicPlayerProvider, useMusicPlayer, useMusicPlayerGenerating)
← src/hooks/useRealtimeVoice.ts (MusicPlayerControl — type)
← src/components/VoiceMode.tsx (useMusicPlayer, useMusicPlayerGenerating)
EXPORTS: MusicPlayerProvider, useMusicPlayer, useMusicPlayerGenerating, MusicPlayerControl
```

---

## 18. HOOKS (NON-VOICE)

### `src/hooks/useLocalStorage.ts`
```
→ react (useCallback, useEffect, useState)
← App.tsx, AppSidebar.tsx, QueryInput.tsx, SettingsDialog.tsx, VoiceMode.tsx,
   ProactiveVisionLoop.tsx, and 10+ other components
EXPORTS: useLocalStorage
```

### `src/hooks/usePreferredSpeechVoice.ts`
```
→ react (useEffect, useState)
→ @/lib/speech-synthesis-voice (pickPreferredSpeechVoice)
← (TTS voice selection)
EXPORTS: usePreferredSpeechVoice
```

### `src/hooks/useDigitalOceanCatalogEnabled.ts`
```
→ react (useState, useEffect)
→ @/lib/types (UserSettings — type)
→ @/lib/digitalocean-api (listDigitalOceanModels)
← @/components/QueryInput.tsx
EXPORTS: useDigitalOceanCatalogEnabled
```

### `src/hooks/useJarvisTelemetry.ts`
```
→ react (useEffect, useState, etc.)
← @/components/HealthDashboard.tsx
EXPORTS: useJarvisTelemetry (SSE /api/dashboard/stream consumer)
```

### `src/hooks/useLessonsData.ts`
```
→ react (useCallback, useEffect, useState)
← @/components/dashboard/LessonsPanel.tsx
EXPORTS: useLessonsData
WIRE: GET /api/dashboard/lessons
```

### `src/hooks/use-mobile.ts`
```
→ react (useEffect, useState)
← (responsive components)
EXPORTS: useIsMobile
```

### `src/hooks/useWakeWord.ts`
```
→ (Web Speech API — no local imports)
← src/App.tsx
EXPORTS: useWakeWord
```

---

## 19. BROWSER SUBSYSTEM

### `src/browser/types.ts` / `types-inspector.ts` / `types-layout.ts`
```
→ (no imports)
← JarvisBrowserShell.tsx, electron-browser-bridge.ts, inspector panels, index.ts
EXPORTS: BrowserTab, Bookmark, BrowserSettings, DownloadItem, DomNode,
         InspectorHoverEvent, InspectorSelectionEvent, InspectorAiRequest,
         LayoutEditAction, NodeAttributeEdit, InspectorChatTicket
```

### `src/browser/index.ts`  ← BARREL
```
→ @/browser/types, types-inspector, types-layout
→ @/browser/inspector/source-mapping
→ @/browser/inspector/layout-editor
→ @/browser/dev/DevSourceMarker
→ @/browser/jarvis-browser-runtime
→ @/browser/screen-browser-act
→ @/browser/electron-browser-bridge
→ @/browser/stores/dom-inspector-store
→ @/browser/hooks/useDomInspector
← src/App.tsx (InspectorAiRequest, InspectorChatTicket via types-layout)
```

### `src/browser/JarvisBrowserShell.tsx`  ← BROWSER UI HUB
```
→ react
→ @/components/ui/* (dialog, button, input, dropdown-menu, context-menu, switch, label, alert)
→ @phosphor-icons/react, lucide-react
→ @/lib/secure-random
→ @/lib/utils
→ @/browser/electron-browser-bridge
→ @/browser/omnibox
→ @/browser/iframe-proxy
→ @/browser/embed-url-guard
→ @/browser/constants
→ @/browser/types
→ @/browser/stores/* (settings, session, bookmarks, downloads, history)
→ @/components/in-app-browser/InAppBrowserWebviewArea
→ @/contexts/BrowserControlContext
→ @/lib/browser-agent-scripts
→ @/components/GuidanceHighlight
→ @/browser/jarvis-browser-runtime
→ @/browser/panels/BrowserManagerPanels
→ @/browser/panels/DevToolsDomInspectorPanel
→ @/browser/types-layout
→ @/ui/toast/ToastHost
→ sonner
← src/components/WebBrowserModal.tsx
← src/components/AgentBrowserPanel.tsx
```

### `src/browser/electron-browser-bridge.ts`
```
→ @/browser/stores/settings-store
→ @/browser/types-inspector
→ @/browser/types-layout
← JarvisBrowserShell.tsx, browser/index.ts
EXPORTS: electronBrowserBridge, JarvisBrowserInspectorBridge, IPC bridging functions
```

### `src/browser/iframe-proxy.ts`
```
→ (no local imports)
← JarvisBrowserShell.tsx
EXPORTS: proxyUrlForIframe, isProxiedUrl, extractOriginalUrl
```

### `src/browser/screen-browser-act.ts`
```
→ @/browser/jarvis-browser-runtime (JarvisBrowser)
→ @/ui/toast/toast-helpers (showBrowserToast)
← src/orchestrator/screen-agent-handler.ts (BROWSER_ACT_GOAL_CONTINUE)
← src/App.tsx (handleBrowserActGoal)
← src/browser/index.ts
EXPORTS: handleBrowserActGoal, BROWSER_ACT_GOAL_CONTINUE, JarvisBrowserActIpcPayload
```

### `src/browser/jarvis-browser-runtime.ts`
```
→ @/browser/types (BrowserSession, BrowserTab)
← JarvisBrowserShell.tsx, screen-browser-act.ts, browser/index.ts
EXPORTS: JarvisBrowser (singleton), registerJarvisBrowserImpl, JarvisBrowserImpl
```

### `src/browser/omnibox.ts`
```
→ @/browser/constants (defaultHomepageFromEnv)
→ @/browser/types (BrowserSettings — type)
← JarvisBrowserShell.tsx
EXPORTS: resolveOmniboxInput, normalizeNavigationUrl, resolvedLiveWebHomepage
```

### `src/browser/constants.ts`
```
→ (no imports — env vars)
← JarvisBrowserShell.tsx, omnibox.ts
EXPORTS: MAX_TABS, defaultHomepageFromEnv
```

### `src/browser/embed-url-guard.ts`
```
→ (no imports)
← JarvisBrowserShell.tsx
EXPORTS: isEmbeddableBrowserNavigationUrl
```

### `src/browser/stores/settings-store.ts` / `session-store.ts` / `bookmarks-store.ts` / `downloads-store.ts` / `history-store.ts`
```
→ (localStorage / sessionStorage — no local imports)
← JarvisBrowserShell.tsx
EXPORTS: load*, save*, add*, remove* functions
```

### `src/browser/stores/dom-inspector-store.ts`
```
→ (no imports)
← browser/index.ts, DevToolsDomInspectorPanel.tsx
EXPORTS: DomInspectorTabState, DomInspectorState
```

### `src/browser/hooks/useDomInspector.ts`
```
→ react
← DevToolsDomInspectorPanel.tsx, browser/index.ts
EXPORTS: useDomInspector
```

### `src/browser/inspector/layout-editor.ts` / `source-mapping.ts`
```
→ @/browser/types-layout
← browser/index.ts
EXPORTS: LayoutEditor, SourceMapping utilities
```

### `src/browser/panels/BrowserManagerPanels.tsx` / `DevToolsDomInspectorPanel.tsx` / `DomNodeDetailsPanel.tsx` / `DomTreeView.tsx`
```
→ react, @/components/ui/*, @/browser/stores/dom-inspector-store, @/browser/types-inspector
← JarvisBrowserShell.tsx
```

---

## 20. COMPONENTS — CORE UI

### `src/components/VoiceMode.tsx`
```
→ react (useEffect, useCallback)
→ @phosphor-icons/react
→ @/hooks/useRealtimeVoice (useRealtimeVoice, VoicePipelineState)
→ @/hooks/useVision (useVision)
→ @/contexts/TuneInControlContext (useTuneInControl)
→ @/contexts/BrowserControlContext (useBrowserControl, useBrowserGuideMode, useBrowserAutomating, useBrowserAgentSteps)
→ @/contexts/MediaCanvasContext (useMediaCanvas, useMediaCanvasGenerating)
→ @/contexts/useCodeEditorHooks (useCodeEditor)
→ @/contexts/MusicPlayerContext (useMusicPlayer, useMusicPlayerGenerating)
→ @/hooks/useLocalStorage
→ @/lib/types (UserSettings)
→ @/lib/defaults (DEFAULT_USER_SETTINGS)
→ @/lib/utils (cn)
→ @/lib/voice-mode-ui (setRendererVoiceModeOpen)
← src/App.tsx
EXPORTS: VoiceMode
```

### `src/components/QueryInput.tsx`
```
→ react, @/components/ui/* (textarea, button, switch, label, popover, badge, separator)
→ sonner (toast)
→ @/lib/types (CloudFile, UploadedFile, UserSettings)
→ @/lib/helpers (processFile)
→ @/lib/rag (ragIngestBulk)
→ @/lib/digitalocean-api
→ @/hooks/useDigitalOceanCatalogEnabled
→ @/hooks/useLocalStorage
→ @/components/FileAttachment, FilePreviewModal, ModelCouncilSelector, CloudFileBrowser, FileAnalysisDialog
→ @phosphor-icons/react
← src/App.tsx
EXPORTS: QueryInput
```

### `src/components/Message.tsx`
```
→ react, @phosphor-icons/react
→ @/lib/types (Message, UploadedFile)
→ @/lib/utils (cn)
→ ./SourceCard, ./MarkdownRenderer, ./FileAttachment, ./FilePreviewModal
→ ./FollowUpQuestions, ./ModelCouncilResponse, ./QuickAnswer
→ ./ImageGallery, ./VideoCard (VideoRow), ./A2EMediaResult
→ ./MessageActionToolbar, ./ThinkingProcessPanel
← src/App.tsx
EXPORTS: Message
```

### `src/components/AppSidebar.tsx`
```
→ react, @phosphor-icons/react
→ @/hooks/useLocalStorage
→ @/components/ui/* (button, badge, scroll-area, separator, collapsible)
→ @/lib/types (Thread, Workspace)
→ @/lib/helpers (formatTimestamp)
→ @/lib/utils (cn)
→ @/contexts/BrowserControlContext (useBrowserGuideMode)
← src/App.tsx
EXPORTS: AppSidebar
```

### `src/components/SettingsDialog.tsx`
```
→ react, @phosphor-icons/react, sonner
→ @/hooks/useLocalStorage
→ @/lib/types (UserSettings)
→ @/lib/defaults (DEFAULT_USER_SETTINGS)
→ @/lib/oauth (buildAuthUrl, isTokenExpired)
→ @/lib/voice-registry (VoiceProfile)
→ @/components/PlaidLinkButton
→ @/components/ui/* (button, input, label, dialog, tabs, card, switch, separator, badge, select)
← src/App.tsx
EXPORTS: SettingsDialog
```

### `src/components/MarkdownRenderer.tsx`
```
→ react (useMemo, createElement, Fragment, useState)
→ marked, dompurify, prism-react-renderer
→ @/lib/utils (cn)
→ @phosphor-icons/react (Copy, Check)
→ @/components/ui/button
→ sonner (toast)
← src/components/Message.tsx
← Many other components
EXPORTS: MarkdownRenderer
```

### `src/components/ProactiveVisionLoop.tsx`
```
→ react (useEffect, useRef)
→ @/hooks/useLocalStorage
→ @/lib/types (UserSettings)
→ @/lib/defaults (DEFAULT_USER_SETTINGS)
→ @/lib/jarvis-native-bridge (getJarvisNative)
→ @/lib/proactive-vision (parseProactiveSuggestion, runProactiveVisionObservation)
→ sonner (toast)
→ @/lib/tts (playTts)
→ @/lib/voice-mode-ui (isRendererVoiceModeOpen)
← src/App.tsx
EXPORTS: ProactiveVisionLoop
```

### Other Notable Components
```
src/components/WebBrowserModal.tsx        → @/browser/JarvisBrowserShell
src/components/AgentBrowserPanel.tsx      → @/browser/JarvisBrowserShell
src/components/A2EStudioPanel.tsx         → @/lib/a2e-api, a2e-download, @/lib/types
src/components/MediaCanvasModal.tsx       → @/contexts/MediaCanvasContext, @/lib/a2e-download
src/components/MusicPlayerModal.tsx       → @/contexts/MusicPlayerContext
src/components/CodeEditorModal.tsx        → @/contexts/useCodeEditorHooks, @/lib/jarvis-ide-bridge
src/components/HealthDashboardRoute.tsx   → @/components/HealthDashboard
src/components/HealthDashboard.tsx        → @/hooks/useJarvisTelemetry, @/lib/healthDashboardAccess
src/components/ModelCouncilSelector.tsx  → @/lib/types (UserSettings)
src/components/OAuthCallback.tsx          → @/lib/oauth
src/components/CloudFileBrowser.tsx       → @/lib/cloudServices
src/components/PlaidLinkButton.tsx        → @/lib/plaid-api
```

---

## 21. COMPONENTS — MODULES & LAYOUT

### `src/components/layout/AppModuleRails.tsx`
```
→ react, @/components/modules/*
← src/App.tsx
EXPORTS: AppModuleRails
```

### Module Components (each wired to a lib or context)
```
TuneInModuleCard.tsx        → @/lib/tunein, @/contexts/TuneInControlContext
MediaPlayerModule.tsx       → @/lib/spotify-api, @/lib/spotify-oauth
CalendarModuleCard.tsx      → @/lib/google-calendar (list events)
SocialTimelineModuleCard.tsx → @/lib/social-api
WeatherModuleCard.tsx       → (fetch — weather API)
NowTVModuleCard.tsx         → (streaming service embed)
GenericDummyModuleCard.tsx  → (placeholder)
RailDummyWidgets.tsx        → (placeholder)
```

---

## 22. COMPONENTS — DASHBOARD

### `src/app/dashboard/page.tsx`
```
→ react, recharts
→ @/components/dashboard/* (all 8 dashboard sub-components)
→ @/hooks/useJarvisTelemetry, @/hooks/useLessonsData
← src/App.tsx (lazy import)
```

### Dashboard Sub-components
```
ConfidenceTimeline.tsx  → recharts, @/lib/utils
CostBreakdown.tsx       → recharts
KpiHeader.tsx           → (UI only)
LessonsPanel.tsx        → @/hooks/useLessonsData
ReasoningReplay.tsx     → (UI only)
ReasoningTrace.tsx      → (UI only)
ReflexionTimeline.tsx   → recharts
TotBranchTree.tsx       → recharts
```

---

## 23. COMPONENTS — IDE

### `src/components/ide/jarvisIdeCodeEditorMenuFactory.ts`
```
→ (no imports — menu config)
← jarvisIdeFullMenus.ts
EXPORTS: createCodeEditorMenus
```

### `src/components/ide/jarvisIdeFullMenus.ts`
```
→ ./jarvisIdeCodeEditorMenuFactory
← useJarvisIdeMenuContext.ts
EXPORTS: JARVIS_IDE_MENUS
```

### `src/components/ide/useJarvisIdeMenuContext.ts`
```
→ react (useContext)
→ ./jarvisIdeFullMenus
← (IDE panel components)
EXPORTS: useJarvisIdeMenuContext
```

### `src/components/in-app-browser/InAppBrowserWebviewArea.tsx`
```
→ react, electron webview
→ ./webviewPreferences
← JarvisBrowserShell.tsx
EXPORTS: InAppBrowserWebviewArea
```

### `src/components/jarvis/JarvisExplorerBadgeStrip.tsx`
```
→ @/lib/jarvis-explorer-badges
← CodeEditorModal.tsx
EXPORTS: JarvisExplorerBadgeStrip
```

---

## 24. APP ENTRY (REACT ROOT)

### `src/app/api/chat/route.ts`
```
→ openai (or server-side AI SDK)
← (Next.js API route — not active in Electron mode)
```

### `src/app/api/dashboard/stream/route.ts` / `lessons/route.ts` / `snapshot/route.ts`
```
← (Next.js API routes consumed by useJarvisTelemetry, useLessonsData)
```

### `src/api/healthDashboard.ts`
```
← @/components/HealthDashboard.tsx
```

---

## 25. ELECTRON LAYER

### `electron/main.cjs`  ← THE GATEWAY
```
→ node:crypto, node:http, node:https, node:fs, node:path, node:child_process, node:os, node:util, node:stream
→ electron (app, BrowserWindow, dialog, ipcMain, session, shell, webContents)
→ ./jarvis-db.cjs (SQLite chat history)
→ ./rag-db.cjs (PostgreSQL or file RAG)
→ ./spaces-client.cjs (DO Spaces S3)
→ tsx/cjs/api (dynamic — loads src/orchestrator/index.ts at runtime)
→ docx (dynamic — document export)
→ jspdf (dynamic — PDF export)
→ oauth-1.0a (dynamic — Twitter OAuth)
→ crypto-js (dynamic — signing)
→ imapflow (dynamic — IMAP email)

API PROXY ROUTES (all POST unless noted):
  /api/llm                 → OpenAI or DigitalOcean Inference
  /api/tts                 → OpenAI TTS
  /api/tts/elevenlabs      → ElevenLabs TTS
  /api/search/tavily       → Tavily search
  /api/vonage/sms          → Vonage SMS
  /api/vonage/call         → Vonage Voice Call
  /api/rag/search          → rag-db.cjs
  /api/rag/ingest          → rag-db.cjs
  /api/generate-image      → OpenAI DALL-E
  /api/generate-video      → Sora/other video API
  /api/oauth/token         → OAuth token exchange
  /api/oauth/refresh       → OAuth refresh
  /api/email/*             → imapflow IMAP
  /api/plaid/*             → Plaid API
  /api/suno/*              → Suno API
  /api/export/docx         → docx library
  /api/export/pdf          → jspdf library
  /api/dashboard/stream    → SSE telemetry
  /api/dashboard/lessons   → lessonsStore
  /api/dashboard/snapshot  → telemetry snapshot

IPC HANDLERS:
  browser:act              → orchestrator screen-browser-act
  vision:analyze           → JarvisVision port 8002
  desktop:*                → jarvis-desktop-automation.cjs
  setVoiceModeActive       → VoiceAgent.setPlaybackSuppressed()

SIDECAR LAUNCHERS:
  vision_service.py        → port 8002 (room camera)
  vonage-ai-voice-bridge   → optional phone call WS bridge
```

### `electron/preload.cjs`
```
→ electron (contextBridge, ipcRenderer)
→ ./jarvis-ide-preload-api.cjs (buildJarvisIdeRendererApis)
← electron/main.cjs (loads as preload script)
EXPOSES to renderer: window.electronAPI (safe IPC bridge)
  - setVoiceModeActive, browser IPC, desktop IPC, jarvis IDE APIs
```

### `electron/jarvis-db.cjs`
```
→ better-sqlite3 (Database)
→ node:crypto (randomUUID)
→ node:path, node:fs
← electron/main.cjs (require)
EXPORTS: createThread, getThread, saveMessage, getMessages, etc.
```

### `electron/rag-db.cjs`
```
→ pg (Pool — PostgreSQL)
→ node:fs
← electron/main.cjs (require)
EXPORTS: ragSearch, ragIngest, ragDelete, ragList
```

### `electron/jarvis-desktop-automation.cjs`
```
→ electron (ipcMain, desktopCapturer, screen, clipboard, session)
→ node:child_process (execFile)
→ node:fs, node:path, node:os, node:util
→ robotjs (dynamic — mouse/keyboard)
← electron/main.cjs (IPC registration)
HANDLES: native_screenshot, native_click, native_type, native_scroll,
         native_key, clipboard_read, clipboard_write, powershell_exec,
         window_list, window_focus, powershell_session_*
```

### `electron/spaces-client.cjs`
```
→ @aws-sdk/client-s3 (GetObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client)
→ @aws-sdk/s3-request-presigner (getSignedUrl)
← electron/main.cjs (Spaces telemetry uploads)
← src/agents/behaviour/spaces-client.ts (browser-side version)
EXPORTS: uploadToSpaces, getFromSpaces, listSpaces, getSignedUrl
```

### `electron/vonage-ai-voice-bridge.cjs`
```
→ node:http, node:path, node:fs
→ ws (WebSocketServer)
← electron/main.cjs (optional launch)
WIRE: Vonage WS → Whisper STT → OpenAI Chat → OpenAI TTS → resample → Vonage WS
```

### `electron/jarvis-ide-preload-api.cjs`
```
→ (no external requires — IPC bridge builder)
← electron/preload.cjs
EXPORTS: buildJarvisIdeRendererApis
```

### `electron/webview-inspector-preload.cjs`
```
→ electron (contextBridge, ipcRenderer)
← electron/main.cjs (loads as webview preload)
EXPOSES: window.webviewInspectorAPI (DOM inspection bridge)
```

### `electron/webview-injected/inspector.js`
```
→ (no requires — injected DOM script)
← electron/main.cjs (webContents.executeJavaScript)
PURPOSE: intercepts DOM events, sends inspector data to webview preload
```

---

## 26. PYTHON SIDECAR

### `python/screen_agent.py`
```
→ base64, io, json, logging, os, queue, re, sys, threading, time, traceback
→ dataclasses, typing
→ dotenv (load_dotenv)
→ PIL (Image, ImageChops, ImageOps)
← src/orchestrator/screen-agent-launcher.ts (spawns as child_process)
← src/agents/screen-agent/python-bridge.ts (WebSocket client)
EXPOSES: WebSocket server on configurable port
RECEIVES: action commands (click, type, scroll, key)
SENDS:    screen frames (base64 PNG + OCR + element list)
```

### `python/pc_controller.py`
```
→ json, logging, os, re, subprocess, sys, threading, time
→ dataclasses, pathlib, typing
← python/screen_agent.py (imports execute_action)
PURPOSE: OS-level desktop control (keyboard, mouse, window management)
SECURITY: path restrictions to home directory, URL whitelist
```

### `python/voice_analysis/analyzer.py`
```
→ struct, typing
→ numpy, parselmouth (Praat), librosa, webrtcvad
← ./server.py (analyze_audio)
EXPORTS: analyze_audio (pitch, MFCC, shimmer, jitter, VAD, prosody)
```

### `python/voice_analysis/state_interpreter.py`
```
→ typing
← ./server.py (interpret_vocal_state)
EXPORTS: interpret_vocal_state (emotion from voice features)
```

### `python/voice_analysis/server.py`
```
→ logging, time
→ fastapi (FastAPI, Request, Response, CORSMiddleware)
→ ./analyzer (analyze_audio)
→ ./state_interpreter (interpret_vocal_state)
← (standalone FastAPI server — optional, not required for core voice)
EXPOSES: POST /analyze → voice features + emotional state
```

---

## 27. VITE PLUGINS (DEV ONLY)

### `vite-plugins/openai-proxy.ts`
```
→ vite, node:http, jwt validation
← vite.config.ts
PURPOSE: Mock OpenAI API with JWT validation (dev mode)
```

### `vite-plugins/browser-proxy.ts`
```
→ vite, node:http
← vite.config.ts
PURPOSE: HTTP proxy for browser API testing (dev mode)
```

### `vite-plugins/jarvis-db.ts`
```
→ vite, better-sqlite3 (in-memory)
← vite.config.ts
PURPOSE: In-memory SQLite for dev (replaces electron/jarvis-db.cjs in dev)
```

---

## TOP-LEVEL DEPENDENCY COUNTS

| File | Imported By (approx) |
|------|----------------------|
| `src/lib/utils.ts` | 74+ files |
| `src/lib/types.ts` | 39+ files |
| `react` | 122+ files |
| `src/lib/observability/telemetryCollector.ts` | 16 reasoning files |
| `src/lib/llm.ts` | 8 files |
| `src/lib/tts.ts` | 4 files |
| `src/reasoning/scratchpadStore.ts` | 10 reasoning files |
| `src/reasoning/cotScratchpad.ts` | 8 reasoning files |
| `src/reasoning/modelRegistry.ts` | 5 reasoning files |
| `eventemitter3` | orchestrator + screen-agent |

---

## CROSS-CUTTING WIRES (EVENT BUS)

```
globalEmitter (eventemitter3 singleton in orchestrator/index.ts)

EMITTERS → EVENT → SUBSCRIBERS
---------------------------------------
screen-agent/index.ts        → screen:state_changed    → screen-agent-handler.ts
screen-agent/index.ts        → screen:advice_generated → screen-agent-handler.ts
screen-agent-handler.ts      → jarvis:speak            → agents/voice/index.ts
screen-agent-handler.ts      → intent:resolved         → screen-agent/index.ts
proactive-engine.ts          → behaviour:suggestion    → screen-agent-handler.ts
renderer (IPC)               → jarvis:user:confirmed   → screen-agent-handler.ts
renderer (IPC)               → jarvis:user:cancelled   → screen-agent-handler.ts
jarvis-vision-proactive.ts   → vision:scene            → behaviour-logger.ts
```

---

## SECURITY BOUNDARIES

```
CLIENT (Vite/React renderer)
  → can only call /api/* routes (proxied)
  → NEVER has API keys for Tavily, ElevenLabs, OpenAI, Vonage

ELECTRON MAIN PROCESS (server-side)
  → holds all API keys in .env
  → proxies all external API calls
  → validates IPC payloads via preload whitelist

PYTHON SIDECAR
  → path-restricted to home directory
  → URL whitelist for browser automation
  → receives only JSON commands from Node.js bridge
```
