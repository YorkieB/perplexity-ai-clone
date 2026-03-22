# Planning Guide

An advanced AI-powered search engine that provides intelligent research capabilities with source attribution, organized through workspaces and persistent conversation threads.

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

### AI Search with Source Attribution
- **Functionality**: LLM-powered responses enriched with real-time web search results from Tavily API, including cited sources with URLs, titles, and relevant snippets
- **Purpose**: Provides trustworthy, verifiable, and up-to-date information for research tasks by combining AI reasoning with current web data
- **Trigger**: User submits any query in an active thread
- **Progression**: Query submitted → User message appears → Web search executes in background → Loading skeleton for AI response → Search results gathered → Response generated with real-time context → Response streams in with synthesized information → Source cards appear at bottom with actual web results → Click source → Opens in new tab
- **Success criteria**: Sources are relevant, current, and clickable; citations map to source cards; responses feel conversational yet authoritative; graceful fallback if search API fails; toast notification on search errors

### Empty State Experience
- **Functionality**: When no thread is active, display large centered textarea with welcoming interface
- **Purpose**: Creates an inviting starting point that emphasizes the core search functionality
- **Trigger**: User opens app with no active thread or clicks "New Chat"
- **Progression**: App loads/New chat clicked → Main view shows centered large textarea → User types → Textarea expands to fit content → Submit creates new thread
- **Success criteria**: Textarea auto-focuses, expands smoothly up to max height, Advanced Analysis toggle is clearly visible

### Real-Time Web Search Integration
- **Functionality**: Integration with Tavily Search API for real-time web data retrieval on every query
- **Purpose**: Ensures AI responses are grounded in current, verifiable web information
- **Trigger**: Automatically executes when user submits a query
- **Progression**: Query submitted → Tavily API called with advanced search depth → Up to 6 high-quality sources retrieved → Results passed as context to LLM → LLM synthesizes answer using web data → Sources displayed with response
- **Success criteria**: API key properly configured via environment variable, graceful error handling with user-friendly toast notifications, no hardcoded credentials, search failures don't block basic AI functionality

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
  - Custom source citation component with hover states showing full snippet
  - Custom sidebar navigation items with active state indicators (vertical accent bar)
  - Custom empty state component with centered layout and example queries
  - Custom loading indicator for streaming AI responses (animated gradient)

- **States**:
  - Buttons: Default → Hover (lighter shade) → Active (pressed down effect) → Disabled (reduced opacity)
  - Inputs: Default border → Focus (accent glow with ring) → Error (red border) → Disabled
  - Sidebar Items: Default → Hover (background highlight) → Active (accent border + background) → Loading (skeleton)
  - Toggle: Off (muted) → Transitioning (spring animation) → On (accent color glow)

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
  - Source cards stack vertically instead of grid
  - Input bar maintains sticky position but with reduced padding
  - Workspace detail view becomes scrollable single column
  - Touch targets minimum 44px for all interactive elements
