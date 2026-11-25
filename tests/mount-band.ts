import type { Engine } from 'claude-code/testing'

// the line under the prompt as the app hands it to the band
export const HINT_PROPS = { isDraft: false, isWorking: false, hint: '? for shortcuts' }
// the desktop's widget in the session rail
export const RAIL_PROPS = { title: '5 Hour · Weekly', isFocused: false, bodyColumns: 36, placement: 'widget' as const, anchoredEdges: [], scroll: { offset: 0, bodyRows: 12 }, view: {} }

type Mounted = Awaited<ReturnType<Engine['ui']['mount']>>

/**
 * Mounts every part of the band, the headline above the prompt, the limits under it
 * and, on the desktop, the session rail's widget, and searches them as one: what a
 * person sees around the prompt.
 */
export async function mountBand($: Engine, args: Parameters<Engine['ui']['mount']>[0]): Promise<Mounted> {
  const top = await $.ui.mount(args)
  const bottom = await $.ui.mount({ plugin: args.plugin, surface: args.surface, component: 'PromptHint', props: HINT_PROPS } as never)
  // on the desktop the limits sit in the session rail's widget once it is placed
  const rail = args.surface === 'desktop'
    ? await $.ui.mount({ plugin: args.plugin, surface: 'desktop', component: 'Pane', requestId: 'usage-rail', props: RAIL_PROPS } as never)
    : undefined
  const parts = [top, bottom, ...(rail ? [rail] : [])]
  const both = {
    find: async (q: never) => {
      for (const part of parts) {
        const found = await part.find(q)
        if (found) return found
      }
      return undefined
    },
    findAll: async (q: never) => (await Promise.all(parts.map(part => part.findAll(q)))).flat(),
    redraw: async (p?: never) => { await top.redraw(p); for (const part of parts.slice(1)) await part.redraw() },
    unmount: async () => { for (const part of parts) await part.unmount() },
  } as Record<string, unknown>
  // the mount is frozen: a copy of its methods, with the searches spanning both parts
  return { ...top, ...both } as Mounted
}
