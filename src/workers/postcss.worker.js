import { getColor } from 'tailwindcss-language-service'

import CompileWorker from 'worker-loader?publicPath=/_next/&filename=static/chunks/[name].[hash].js&chunkFilename=static/chunks/[id].[contenthash].worker.js!./compile.worker.js'
import { createWorkerQueue } from '../utils/workers'
import './subworkers'
import { getVariants } from '../utils/getVariants'
import { parseConfig } from './parseConfig'
import { toValidTailwindVersion } from '../utils/toValidTailwindVersion'
import { isObject } from '../utils/object'

const compileWorker = createWorkerQueue(CompileWorker)

let state

let lastHtml
let lastCss
let lastConfig

addEventListener('message', async (event) => {
  if (event === undefined || !event.data) {
    return
  }

  if (
    (typeof event.data.css !== 'undefined' &&
      typeof event.data.config !== 'undefined' &&
      typeof event.data.html !== 'undefined') ||
    event.data._recompile
  ) {
    const html = event.data._recompile ? lastHtml : event.data.html
    const css = event.data._recompile ? lastCss : event.data.css
    const config = event.data._recompile ? lastConfig : event.data.config

    const isFreshBuild = css !== lastCss || config !== lastConfig

    lastHtml = html
    lastCss = css
    lastConfig = config

    const result = await compileWorker.emit({
      ...event.data,
      _isFreshBuild: isFreshBuild,
      html,
      css,
      config,
    })

    if (!result.error && !result.canceled) {
      if ('buildId' in result) {
        self.BUILD_ID = result.buildId
      }
      if (result.state) {
        let tailwindVersion = toValidTailwindVersion(event.data.tailwindVersion)
        let [
          { default: postcss },
          { default: postcssSelectorParser },
          { generateRules },
          { createContext },
          { default: expandApplyAtRules },
          { default: resolveConfig },
        ] = await Promise.all([
          import('postcss'),
          import('postcss-selector-parser'),
          result.state.jit
            ? tailwindVersion === '2'
              ? import('tailwindcss-v2/lib/jit/lib/generateRules')
              : import('tailwindcss/lib/lib/generateRules')
            : {},
          result.state.jit
            ? tailwindVersion === '2'
              ? import('tailwindcss-v2/lib/jit/lib/setupContextUtils')
              : import('tailwindcss/lib/lib/setupContextUtils')
            : {},
          result.state.jit
            ? tailwindVersion === '2'
              ? import('tailwindcss-v2/lib/jit/lib/expandApplyAtRules')
              : import('tailwindcss/lib/lib/expandApplyAtRules')
            : {},
          tailwindVersion === '2'
            ? import('tailwindcss-v2/resolveConfig')
            : import('tailwindcss/resolveConfig'),
          result.state.jit
            ? tailwindVersion === '2'
              ? import('tailwindcss-v2/lib/jit/lib/setupTrackingContext')
              : import('tailwindcss/lib/lib/setupTrackingContext')
            : {},
        ])

        state = result.state
        state.modules = {
          postcss: { module: postcss },
          postcssSelectorParser: { module: postcssSelectorParser },
          ...(result.state.jit
            ? {
                jit: {
                  generateRules: {
                    module: generateRules,
                  },
                  expandApplyAtRules: {
                    module: expandApplyAtRules,
                  },
                },
              }
            : {}),
        }
        state.config = resolveConfig(await parseConfig(config, tailwindVersion))
        if (result.state.jit) {
          state.jitContext = createContext(state.config)
          if (state.jitContext.getClassList) {
            state.classList = state.jitContext
              .getClassList()
              .map((className) => {
                return [className, { color: getColor(state, className) }]
              })
          }
        }
      }
      if (state) {
        state.variants = getVariants(state || {})
        state.screens = isObject(state.config.screens)
          ? Object.keys(state.config.screens)
          : []
        state.editor.getConfiguration = () => ({
          editor: {
            tabSize: 2,
          },
          tailwindCSS: {
            validate: true,
            classAttributes: ['class'],
            lint: {
              cssConflict: 'warning',
              invalidApply: 'error',
              invalidScreen: 'error',
              invalidVariant: 'error',
              invalidConfigPath: 'error',
              invalidTailwindDirective: 'error',
              recommendedVariantOrder: 'warning',
            },
          },
        })
        state.enabled = true
      }
      postMessage({
        _id: event.data._id,
        css: result.css,
        html: result.html,
        jit: result.jit,
      })
    } else {
      postMessage({ ...result, _id: event.data._id })
    }
  }
})
