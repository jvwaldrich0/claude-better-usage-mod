import type { Engine } from 'claude-code/testing'

// the line under the prompt as the app hands it to the band
export const HINT_PROPS = { isDraft: false, isWorking: false, hint: '? for shortcuts' }

type Mounted = Awaited<ReturnType<Engine['ui']['mount']>>

/**
 * Mounts both parts of the band, the headline above the prompt and the limits under
 * it, and searches them as one: what a person sees around the prompt.
 */
export async function mountBand($: Engine, args: Parameters<Engine['ui']['mount']>[0]): Promise<Mounted> {
  const top = await $.ui.mount(args)
  const bottom = await $.ui.mount({ plugin: args.plugin, surface: args.surface, component: 'PromptHint', props: HINT_PROPS } as never)
  const both = {
    find: async (q: never) => (await top.find(q)) ?? (await bottom.find(q)),
    findAll: async (q: never) => [...(await top.findAll(q)), ...(await bottom.findAll(q))],
    redraw: async (p?: never) => { await top.redraw(p); await bottom.redraw() },
    unmount: async () => { await top.unmount(); await bottom.unmount() },
  } as Record<string, unknown>
  // the mount is frozen: a copy of its methods, with the searches spanning both parts
  return { ...top, ...both } as Mounted
}
