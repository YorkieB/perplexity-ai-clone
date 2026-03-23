# Planning Guide

Nexus is an advanced AI-powered search application that provides intelligent research capabilities with source attribution, organized through workspaces and persistent conversation threads.

**Experience Qualities**:
1. **Instantaneous** - Every interaction feels immediate with optimistic updates and skeleton loading states that maintain flow without interruption
2. **Intelligent** - The interface anticipates user needs through contextual workspace switching, smart defaults, and progressive disclosure of advanced features
3. **Refined** - A sophisticated dark-mode aesthetic with precise typography, subtle animations, and carefully considered spacing creates a premium research environment

**Complexity Level**: Complex Application (advanced functionality, likely with multiple views)
This is a multi-view application with sophisticated state management across workspaces, threads, and messages, real-time AI integration, CRUD operations, and contextual navigation patterns.

## Essential Features

### Collapsible Sidebar Navigation
- **Functionality**: Left sidebar with Library (chat history) and Workspaces sections, collapsible to maximize screen space
- **Purpose**: Provides quick access to conversation history and workspace contexts while maintaining focus on active content
- **Trigger**: Automatically visible on desktop, toggle button for mobile/collapsed state
- **Progression**: User clicks collapse icon → Sidebar animates to narrow state showing only icons → Click expand → Full sidebar returns with smooth animation
- **Success criteria**: Sidebar state persists between sessions, animations are smooth (300ms), content remains accessible in both states

### Workspace Management (Full CRUD)
- **Functionality**: Create, read, update, and delete collaborative workspace environments with custom system prompts
- **Purpose**: Allows users to organize research into different contexts with tailored AI behavior
- **Trigger**: Click "New Workspace" button in sidebar or click existing workspace
- **Progression**: Click new workspace → Dialog opens with name/description/prompt fields → Save → Workspace appears in sidebar → Click workspace → Main view switches to workspace detail with editable fields
- **Success criteria**: All operations complete within 200ms (optimistic updates), validation prevents empty names, delete requires confirmation

### Thread Management
- **Functionality**: Persistent conversation threads that maintain full message history with AI responses and sources
- **Purpose**: Enables users to build upon previous research and maintain context across sessions
- **Trigger**: User submits query in main input or starts new chat
- **Progression**: User types query → Presses Enter/Submit → Message appears immediately → Loading state shows → AI response streams in with sources → Thread saved to library automatically
- **Success criteria**: Messages persist across sessions, threads show in Library sorted by most recent, thread titles auto-generate from first message

### Advanced Analysis Mode
- **Functionality**: Toggle that enables deeper research mode with enhanced AI reasoning
- **Purpose**: Gives users control over response depth and computational intensity
- **Trigger**: Toggle switch below main input area
- **Progression**: User enables toggle → Visual indicator confirms state → Next query includes advanced analysis flag in prompt → AI provides more comprehensive response
- **Success criteria**: Toggle state persists per workspace, visual feedback is immediate, responses demonstrably differ in depth

### Nexus search with source attribution
- **Functionality**: LLM-powered responses enriched with real-time web search results from Tavily API, including cited sources with URLs, titles, and relevant snippets. Features advanced Markdown rendering with language-specific syntax highlighting for code blocks (supporting 20+ languages including JavaScript, TypeScript, Python, Java, CSS, HTML, JSX, TSX, JSON, Bash, SQL, Rust, Go, Ruby, PHP, Swift, Kotlin, C++, and C), support for tables, lists, and inline citations that interactively highlight corresponding sources.
- **Purpose**: Provides trustworthy, verifiable, and up-to-date information for research tasks by combining AI reasoning with current web data, with visual citation mapping for immediate fact verification and beautifully formatted code examples.
- **Trigger**: User submits any query in an active thread
- **Progression**: Query submitted → User message appears → Web search executes in background → Loading skeleton for AI response → Search results gathered → Response generated with real-time context → Response streams in with synthesized information → Horizontal scrollable source carousel appears above response with favicon, domain, and title for each source → Markdown-formatted response renders with proper formatting → Code blocks appear with language-specific syntax highlighting using prism-react-renderer, each with a header showing the language in a distinct accent color → User can copy code with one-click button → User hovers over inline citation numbers [1], [2], etc. → Corresponding source card in carousel highlights with accent ring and scale animation → Click citation or source card → Opens in new tab
- **Success criteria**: Sources are relevant, current, and clickable; inline citations [1], [2] etc. are parsed from response text and rendered as interactive superscripts; hovering/clicking citations highlights corresponding source cards; Markdown renders correctly including bold, lists, tables, and code blocks; code blocks have proper syntax highlighting with language-specific colors; each language displays in a unique accent color in the code block header; copy button works reliably; source carousel is horizontally scrollable on mobile; graceful fallback if search API fails; toast notification on search errors

### Empty State Experience
- **Functionality**: When no thread is active, display large centered textarea with welcoming interface
- **Purpose**: Creates an inviting starting point that emphasizes the core search functionality
- **Trigger**: User opens app with no active thread or clicks "New Chat"
- **Progression**: App loads/New chat clicked → Main view shows centered large textarea → User types → Textarea expands to fit content → Submit creates new thread
- **Success criteria**: Textarea auto-focuses, expands smoothly up to max height, Advanced Analysis toggle is clearly visible

### Settings & Cloud Connections
- **Functionality**: Centralized settings dialog with two tabs: API Keys (DigitalOcean Spaces, Google Drive, OneDrive, GitHub, Dropbox) and Cloud Storage (connection management for Google Drive, OneDrive, GitHub, Dropbox). Each cloud service displays connection status badge and requires API key configuration before connecting. Dropbox joins existing services as a fourth cloud storage option.
- **Purpose**: Provides secure API key management and cloud service authentication in a single location, enabling file imports from multiple cloud platforms including Dropbox
- **Trigger**: Click Settings icon in sidebar or when attempting to use cloud features without configured credentials
- **Progression**: User clicks Settings → Dialog opens with tabs → API Keys tab shows masked key inputs with show/hide toggles for DigitalOcean, Google Drive, OneDrive, GitHub, and Dropbox → User enters/updates keys → Saves → Cloud Storage tab shows service cards (Google Drive, OneDrive, GitHub, Dropbox) with connection status badges → User clicks Connect on desired service (requires corresponding API key) → Mock authentication simulates connection → Success toast → Service marked as Connected with green checkmark → User can now access files from connected service via Cloud file browser
- **Success criteria**: API keys are stored securely in browser using useKV hook, masked by default with show/hide toggle, settings persist across sessions, connection status accurately reflects authentication state, Dropbox integrates seamlessly with same UX as other services, disconnect functionality works reliably, helpful validation messages guide user through setup

### Real-Time Web Search Integration
- **Functionality**: Integration with Tavily Search API for real-time web data retrieval on every query
- **Purpose**: Ensures AI responses are grounded in current, verifiable web information
- **Trigger**: Automatically executes when user submits a query
- **Progression**: Query submitted → Tavily API called with advanced search depth → Up to 6 high-quality sources retrieved → Results passed as context to LLM → LLM synthesizes answer using web data → Sources displayed with response
- **Success criteria**: API key properly configured via environment variable, graceful error handling with user-friendly toast notifications, no hardcoded credentials, search failures don't block basic AI functionality

### Enhanced Query Input with Advanced Options
- **Functionality**: Rich input interface with expandable options menu including file upload, cloud integration (Google Drive, OneDrive, GitHub, Dropbox), connectors, deep research mode, model council with customizable model selection, and learning modes. Features model selection, voice input, and keyboard shortcuts. Uploaded files are displayed as compact attachment cards below the input with preview capability. When Model Council is active, displays a prominent indicator banner showing the number of selected models with option to disable.
- **Purpose**: Provides power users with advanced tools while maintaining simplicity for basic searches through progressive disclosure
- **Trigger**: Click "+" button to reveal options menu, click "Model council" option to open model selector dialog, click "Cloud" option to open cloud file browser for Dropbox, Google Drive, OneDrive, or GitHub, or type "/" for search mode shortcuts
- **Progression**: User clicks + icon → Popover menu appears with options → For Model Council: User selects "Model council" option → Model selector dialog opens showing 6 available models (GPT-4o, GPT-4o Mini, Claude 3.5 Sonnet, Claude 3 Opus, Claude 3 Haiku, Gemini 2.0 Flash) with descriptions and badges → User checks/unchecks models (minimum 2 required) → Clicks "Start Council" → Success toast notification → Visual indicator banner appears above input showing "{N} models" selected → For Cloud Files: User selects "Cloud" option → Cloud browser dialog opens showing four connected services (Google Drive, OneDrive, GitHub, Dropbox) as clickable cards → User selects service → Files from connected service load in grid → User can search/filter files → Select files to import → Imported files appear as attachment cards
- **Success criteria**: Options menu is intuitive and accessible, badges clearly indicate new/premium features, model selector enforces minimum 2 models requirement, selected models persist across dialog reopens, active council indicator is visible and dismissible, model selector shows helpful validation messages, voice input button provides visual feedback, keyboard shortcuts are discoverable, textarea auto-expands as user types, cloud browser shows connection status for each service (connected/not connected), only connected services are clickable, Dropbox integration works alongside existing services seamlessly, all interactive elements have proper hover/focus states

### Model Council Multi-Model Analysis
- **Functionality**: Parallel execution of query across multiple selected AI models (GPT-4o, GPT-4o Mini, Claude 3.5 Sonnet, Claude 3 Opus, Claude 3 Haiku, Gemini 2.0 Flash) with convergence analysis showing areas of agreement and divergence. Features tabbed interface for viewing individual model responses, overview summary, and detailed analysis. Each model tab displays a colored badge identifying the model family (blue for GPT, purple for Claude, teal for Gemini).
- **Purpose**: Provides comprehensive multi-perspective analysis by consulting multiple AI models simultaneously, helping users understand consensus and alternative viewpoints on complex topics
- **Trigger**: Enable Model Council through query input options menu, select desired models (minimum 2), submit query
- **Progression**: Query submitted with Model Council enabled → Multiple models process query in parallel → Convergence analysis calculates agreement score (0-100%) and identifies common themes and divergent points → Response displays with "Model Council" badge and convergence indicator (green checkmark for high convergence 80%+, yellow warning for medium 50-80%, orange divergence icon for low <50%) → Tabbed interface shows Overview tab with consensus summary and key points, individual model tabs with full responses and model-specific badges, and Analysis tab breaking down agreements and disagreements → User can switch between tabs to compare perspectives → Citations and sources work across all model responses
- **Success criteria**: All selected models respond within reasonable time (30 seconds), convergence analysis provides meaningful insights, tab interface is intuitive with model names clearly labeled, model-specific badges use distinct colors (GPT=blue, Claude=purple, Gemini=teal), convergence score accurately reflects agreement level, common themes and divergent points are actionable and specific, error handling gracefully manages individual model failures without blocking other responses

### File Preview Modal
- **Functionality**: Full-screen modal dialog for previewing uploaded images and text-based documents (txt, md, csv, json) with download capability. Images display at full resolution with zoom controls, text files show content in a monospace font with scroll area, PDFs show a download prompt.
- **Purpose**: Allows users to verify file contents before submission and review attached files in message history without leaving the application
- **Trigger**: Click on any file attachment card in the query input area or in message history
- **Progression**: User clicks file attachment → Modal opens with smooth animation → File content/preview loads → User can scroll through text or view full image → Click Download button to save locally → Click Close or outside modal to dismiss
- **Success criteria**: Modal opens instantly with smooth fade-in animation, images scale appropriately to viewport, text is readable and scrollable, download functionality works for all file types, modal is dismissible via Close button/Escape key/outside click, proper error states for unsupported file types

### Active Thread View
- **Functionality**: Scrollable message history with sticky input bar at bottom
- **Purpose**: Maintains conversation context while keeping input always accessible
- **Trigger**: User clicks existing thread or creates first message in new thread
- **Progression**: Thread selected → Messages load with skeletons → History appears → Scroll to latest → Input bar remains fixed → New messages auto-scroll
- **Success criteria**: Smooth scrolling, new messages auto-scroll to view, input never obscured, loading states prevent layout shift

## Edge Case Handling
- **Empty Library**: Display encouraging empty state with "Start your first search" prompt and example queries
- **Failed AI Requests**: Show error message with retry button, preserve user's query in input for resubmission
- **Failed Web Search**: Display toast notification about search failure, continue with AI response using only LLM knowledge (graceful degradation)
- **Missing API Key**: Log error to console, show user-friendly toast about search service configuration, continue with basic AI functionality
- **Network Offline**: Indicate offline state in UI, queue messages for sending when reconnected
- **Long Messages**: Implement text wrapping and max heights with scroll for excessively long responses
- **Concurrent Edits**: Optimistic updates with rollback on error, showing toast notifications for conflicts
- **Missing Workspace**: If workspace ID in URL doesn't exist, redirect to home with toast notification
- **Empty Workspace Name**: Prevent submission, show inline validation error
- **Delete Active Thread**: After deletion, return to empty state or switch to most recent thread

## Design Direction
The design should evoke the feeling of a professional research laboratory at night—dark, focused, and intellectually stimulating. Users should feel they're using a sophisticated tool that respects their intelligence. The interface should fade into the background, allowing the content and ideas to take center stage while providing subtle moments of delight through smooth transitions and thoughtful micro-interactions.

## Color Selection
A sophisticated dark-mode palette inspired by deep space and premium code editors, with vibrant accent colors for interactive elements.

- **Primary Color**: Deep Purple `oklch(0.45 0.15 285)` - Represents intelligence and innovation, used for primary actions and active states
- **Secondary Colors**: 
  - Dark Slate `oklch(0.18 0.01 250)` - Main background, creates depth
  - Charcoal `oklch(0.22 0.01 250)` - Elevated surfaces like cards and sidebar
  - Steel `oklch(0.35 0.02 250)` - Borders and dividers
- **Accent Color**: Electric Cyan `oklch(0.75 0.15 195)` - Attention-grabbing for CTAs, links, and the Advanced Analysis toggle
- **Foreground/Background Pairings**:
  - Background (Dark Slate #1E1E2E oklch(0.18 0.01 250)): Light Gray text (#E0E0E0 oklch(0.88 0 0)) - Ratio 11.2:1 ✓
  - Card (Charcoal #2A2A3C oklch(0.22 0.01 250)): Off-White text (#F5F5F5 oklch(0.96 0 0)) - Ratio 13.8:1 ✓
  - Primary (Deep Purple #6B4FBB oklch(0.45 0.15 285)): White text (#FFFFFF oklch(1 0 0)) - Ratio 5.8:1 ✓
  - Accent (Electric Cyan #3DD8E8 oklch(0.75 0.15 195)): Dark Slate (#1E1E2E oklch(0.18 0.01 250)) - Ratio 8.2:1 ✓

## Font Selection
Typography should feel technical yet approachable, with excellent readability for long-form content.

- **Primary**: Space Grotesk - A geometric sans-serif with a technical edge perfect for headings and navigation, conveying modern precision
- **Secondary**: Inter - Clean and highly legible for body text and message content, ensuring comfortable extended reading

**Typographic Hierarchy**:
- H1 (Empty State Prompt): Space Grotesk Bold/32px/tight letter spacing (-0.02em)
- H2 (Workspace Names): Space Grotesk SemiBold/24px/normal spacing
- H3 (Thread Titles): Space Grotesk Medium/16px/normal spacing
- Body (Messages): Inter Regular/15px/line-height 1.6
- Small (Timestamps, metadata): Inter Regular/13px/muted color
- Input (Query): Inter Regular/16px/line-height 1.5

## Animations
Animations should reinforce the sense of intelligence and responsiveness—every transition should feel purposeful. Use subtle easing functions (ease-out for entrances, ease-in-out for state changes) with quick timing (150-300ms). Key moments: sidebar collapse/expand with smooth width animation, message appearance with gentle fade-up, source cards that scale in subtly, and skeleton loaders with shimmer effects that suggest processing. The Advanced Analysis toggle should have a satisfying spring animation when activated.

## Component Selection
- **Components**:
  - **Sidebar**: Custom component using Collapsible from shadcn for workspace/library sections
  - **Button**: shadcn Button with variants for primary (filled purple), ghost (sidebar items), and destructive (delete actions)
  - **Dialog**: shadcn Dialog for workspace creation/editing with proper focus management
  - **Textarea**: shadcn Textarea for main query input with auto-resize behavior
  - **Switch**: shadcn Switch for Advanced Analysis toggle with custom accent color
  - **ScrollArea**: shadcn ScrollArea for message history and sidebar content
  - **Card**: shadcn Card for source attribution display
  - **Skeleton**: shadcn Skeleton for loading states in messages and source cards
  - **AlertDialog**: shadcn AlertDialog for delete confirmations
  - **Separator**: shadcn Separator for visual divisions in sidebar
  - **Toast**: sonner for notifications (save confirmations, errors)

- **Customizations**:
  - Custom message bubble component with role-based styling (user vs assistant)
  - Custom Markdown renderer component that parses and renders bold, italics, lists (bulleted and numbered), tables, code blocks with language-specific syntax highlighting via prism-react-renderer (Night Owl theme), and blockquotes
  - Code blocks feature a header bar showing the language name in a unique accent color (different colors for JavaScript/yellow, TypeScript/blue, Python/teal, etc.) with integrated copy button
  - Custom citation parser that uses regex to find [1], [2], etc. patterns and transforms them into interactive superscript buttons
  - Custom source card component redesigned as compact horizontal cards showing favicon (via Google favicon API), domain name (extracted from URL), and truncated title
  - Custom source carousel with horizontal scroll, custom scrollbar styling, and highlight states triggered by citation hover
  - Custom sidebar navigation items with active state indicators (vertical accent bar)
  - Custom empty state component with centered layout and example queries
  - Custom loading indicator for streaming AI responses (animated gradient)

- **States**:
  - Buttons: Default → Hover (lighter shade) → Active (pressed down effect) → Disabled (reduced opacity)
  - Inputs: Default border → Focus (accent glow with ring) → Error (red border) → Disabled
  - Sidebar Items: Default → Hover (background highlight) → Active (accent border + background) → Loading (skeleton)
  - Toggle: Off (muted) → Transitioning (spring animation) → On (accent color glow)
  - Citation Superscripts: Default (accent background/text) → Hover (accent solid with scale) → Active (maintains highlight)
  - Source Cards: Default → Hover (border accent) → Highlighted via citation (accent ring, background tint, scale up) → Active (maintains highlight)

- **Icon Selection**:
  - List/Sidebar for sidebar collapse/expand toggle
  - MagnifyingGlass for search emphasis in empty state
  - Plus for creating new workspaces and threads
  - Pencil for editing workspace details
  - Trash for delete operations
  - Lightning for Advanced Analysis indicator
  - ChatCircle for thread items in library
  - Folder for workspace items
  - ArrowRight for message submit
  - Link for source citations
  - Sparkle for AI response indicators

- **Spacing**:
  - Container padding: `p-6` (24px) for main content areas
  - Sidebar width: `w-64` (256px) expanded, `w-16` (64px) collapsed
  - Message gaps: `gap-4` (16px) between messages
  - Card padding: `p-4` (16px) for source cards
  - Input padding: `p-3` (12px) for textarea
  - Sidebar item padding: `px-3 py-2` for navigation items
  - Section gaps: `gap-6` (24px) between major sections

- **Mobile**:
  - Sidebar becomes full-screen overlay with slide-in animation from left
  - Hamburger menu button appears in top-left corner
  - Main textarea reduces to single-column layout with full width
  - Source carousel maintains horizontal scroll with touch gestures, cards sized at 256px-288px width
  - Citation superscripts remain interactive with tap instead of hover
  - Markdown content scales typography appropriately (14px body text on mobile vs 15px desktop)
  - Code blocks in Markdown become horizontally scrollable to prevent overflow
  - Tables in Markdown become horizontally scrollable within their container
  - Input bar maintains sticky position but with reduced padding
  - Workspace detail view becomes scrollable single column
  - Touch targets minimum 44px for all interactive elements including citation superscripts
