/**
 * Example utterances per Jarvis intent route — training data for the semantic router.
 * Richer, more diverse phrases improve embedding-based classification.
 */

const LOG = '[UtteranceLibrary]'

/** One routable intent with example phrases and routing metadata. */
export interface RouteDefinition {
  /** Stable route id (e.g. passed to tool loaders / orchestrator). */
  name: string
  /** Representative user phrases for embedding similarity. */
  utterances: string[]
  /** Human-readable description of when this route applies. */
  description: string
  /** Relative ordering: higher values are typically matched before lower ones (0 = lowest). */
  priority: number
}

/**
 * Canonical route definitions. The `utterances` arrays may be extended at runtime via
 * {@link addUtterancesToRoute}; the array reference itself stays fixed.
 */
export const ROUTE_DEFINITIONS: RouteDefinition[] = [
  {
    name: 'clarification_needed',
    priority: 100,
    description: 'User is referring back to content already shared in the conversation',
    utterances: [
      'I have just given it you',
      'I already gave you that',
      'I shared it above',
      'see my previous message',
      'as I mentioned above',
      'I just sent you that',
      'it is in my last message',
      'I told you this already',
      'you already have it',
      'check what I sent earlier',
      'look at what I shared',
      'I gave you the code above',
      'the file is in the conversation',
      'I already provided that information',
      'it is right there in the chat',
      'see above',
      'refer to what I shared',
      'I gave you the config',
      'you have the data already',
      'I sent the JSON above',
      'the component is above',
      'look at my last message',
      'I provided the details already',
      'check the previous turn',
      'as provided above',
      'use what I gave you',
    ],
  },
  {
    name: 'code_instruction',
    priority: 90,
    description: 'User is giving an instruction to modify, rewrite, fix, or act on code or a technical artefact',
    utterances: [
      'recode this',
      'rewrite this component',
      'fix this function',
      'update the code',
      'refactor this',
      'improve this implementation',
      'add error handling to this',
      'make this more efficient',
      'convert this to TypeScript',
      'add types to this',
      'make this component accessible',
      'add unit tests for this',
      'optimise this function',
      'clean up this code',
      'add comments to this',
      'make this async',
      'add a loading state',
      'handle the edge cases in this',
      'add validation to this',
      'make this work with the API',
      'update the imports',
      'fix the TypeScript errors',
      'make this hook reusable',
      'extract this into a separate component',
      'add dark mode support',
      'make this responsive',
      'fix the bug in this',
      'add logging to this',
      'make this production ready',
      'update the function signature',
      'change the return type',
      'add the missing dependency to useEffect',
      'memoize this',
      'debounce this handler',
      'make this work with React 18',
      'convert class component to functional',
      'add the missing props',
      'fix the async await issue',
      'add proper cleanup to useEffect',
      'update this to use the new API',
    ],
  },
  {
    name: 'knowledge_lookup',
    priority: 50,
    description: 'User is asking a factual question or seeking information',
    utterances: [
      'what is the best way to',
      'how do I',
      'what are the differences between',
      'explain how',
      'what does this error mean',
      'why is this happening',
      'what is the current version of',
      'how does this work',
      'what are the best practices for',
      'search for information about',
      'find documentation on',
      'what is the syntax for',
      'how can I implement',
      'what library should I use for',
      'compare these approaches',
      'what are the pros and cons of',
      'is there a better way to',
      'what is the difference between useEffect and useLayoutEffect',
      'how do I set up authentication',
      'what are the latest updates to',
      'how does RAG work',
      'what is the recommended approach for',
      'can you explain',
      'I need to understand',
      'what are the options for',
      'look up how to',
      'find me information about',
      'research this topic',
      'what does the documentation say about',
    ],
  },
  {
    name: 'voice_task',
    priority: 70,
    description: 'User is working with voice synthesis, audio generation, or speech parameters',
    utterances: [
      'generate a voice for this',
      'make this sound more emotional',
      'change the voice profile',
      'update the emotion scores',
      'make the voice angrier',
      'make it sound happier',
      'adjust the speech parameters',
      'change the voice to sound calmer',
      'generate audio from this text',
      'update the voice configuration',
      'make the voice sound more natural',
      'change the speaking speed',
      'adjust the pitch',
      'make this voice sound sad',
      'generate a voice with this emotion',
      'update the voice model',
      'make the voice sound more energetic',
      'change the voice gender',
      'use the British accent voice',
      'generate speech from this',
      'make the voice whisper',
      'increase the emotion intensity',
      'apply voice cloning',
      'change the audio format',
      'make the voice sound excited',
    ],
  },
  {
    name: 'image_task',
    priority: 70,
    description: 'User is working with image generation, image prompts, or visual content',
    utterances: [
      'generate an image of',
      'create a picture of',
      'update the image prompt',
      'make the image more vibrant',
      'add rain effects to the image',
      'change the art style',
      'make it look more realistic',
      'generate a thumbnail for',
      'update the negative prompt',
      'change the image dimensions',
      'add more detail to the prompt',
      'make the image darker',
      'generate a logo for',
      'create a banner image',
      'update the seed',
      'change the number of inference steps',
      'make the image more cinematic',
      'add a background to',
      'generate a variation of this image',
      'upscale this image',
      'make it look like a painting',
      'generate a photorealistic version',
      'change the lighting in the image',
      'make the colours more saturated',
      'add text overlay to the image',
    ],
  },
  {
    name: 'browser_task',
    priority: 70,
    description: 'User wants browser automation, web scraping, or web interaction',
    utterances: [
      'navigate to this website',
      'scrape this page',
      'fill in this form',
      'click the login button',
      'extract the data from',
      'automate this web task',
      'take a screenshot of',
      'check if this element exists',
      'download the file from',
      'submit this form',
      'log into this website',
      'get the price from',
      'monitor this page for changes',
      'extract all links from',
      'fill out the registration form',
      'automate the checkout process',
      'scrape the search results',
      'click on the first result',
      'wait for the page to load',
      'extract the table data from',
    ],
  },
  {
    name: 'file_task',
    priority: 70,
    description: 'User wants to read, write, or manage files on disk',
    utterances: [
      'save this to a file',
      'read the contents of',
      'write this to disk',
      'create a new file called',
      'delete this file',
      'rename this file',
      'move this file to',
      'copy this file',
      'append this to the file',
      'read the JSON file',
      'parse this CSV file',
      'update the config file',
      'save the output to',
      'load the data from',
      'write the results to',
    ],
  },
  {
    name: 'conversational',
    priority: 10,
    description: 'General conversation, acknowledgements, or simple questions',
    utterances: [
      'thanks',
      'thank you',
      'great',
      'ok',
      'sounds good',
      'perfect',
      'got it',
      'understood',
      'makes sense',
      'that works',
      'awesome',
      'nice',
      'good job',
      'well done',
      'interesting',
      'I see',
      'I understand',
      'alright',
      'sure',
      'yes please',
      'no thanks',
      'not right now',
      'later',
      'how are you',
      'what can you do',
      'who are you',
      'what is your name',
      'hello',
      'hi there',
      'good morning',
      'bye',
    ],
  },
]

/**
 * Look up a route definition by {@link RouteDefinition.name}.
 *
 * @param name - Route id to resolve
 * @returns The matching definition, or `undefined` if unknown
 */
export function getRouteByName(name: string): RouteDefinition | undefined {
  const key = name.trim()
  return ROUTE_DEFINITIONS.find((r) => r.name === key)
}

/** @returns Every {@link RouteDefinition.name} in definition order */
export function getAllRouteNames(): string[] {
  return ROUTE_DEFINITIONS.map((r) => r.name)
}

/**
 * Append normalised utterances to an existing route (in-place). No-op if the route is missing
 * or no non-empty strings are provided.
 *
 * @param routeName - Target {@link RouteDefinition.name}
 * @param newUtterances - Phrases to add (trimmed; empty strings skipped)
 */
export function addUtterancesToRoute(routeName: string, newUtterances: string[]): void {
  const route = getRouteByName(routeName)
  if (route === undefined) {
    return
  }
  const added = newUtterances.map((u) => u.trim()).filter((u) => u.length > 0)
  if (added.length === 0) {
    return
  }
  route.utterances.push(...added)
  console.info(`${LOG} Added ${String(added.length)} utterances to route: ${routeName.trim()}`)
}
