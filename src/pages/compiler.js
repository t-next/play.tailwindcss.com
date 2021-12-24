import { useState, useRef, useEffect, useCallback } from 'react'
import Worker from 'worker-loader!../workers/postcss.worker.js'
import { requestResponse } from '../utils/workers'
import { debounce } from 'debounce'
import useMedia from 'react-use/lib/useMedia'
import { validateJavaScript } from '../utils/validateJavaScript'
import { useDebouncedState } from '../hooks/useDebouncedState'
import Error from 'next/error'
import { toValidTailwindVersion } from '../utils/toValidTailwindVersion'

const DEFAULT_RESPONSIVE_SIZE = { width: 540, height: 720 }

function Pen({
  initialContent,
  initialPath,
  initialLayout,
  initialResponsiveSize,
  initialActiveTab,
}) {
  const worker = useRef()
  const [size, setSize] = useState({ percentage: 0.5, layout: initialLayout })
  const [resizing, setResizing] = useState(false)
  const [result, setResult] = useState('')
  const [activeTab, setActiveTab] = useState(initialActiveTab)
  const [activePane, setActivePane] = useState(
    initialLayout === 'preview' ? 'preview' : 'editor'
  )
  const isMd = useMedia('(min-width: 768px)')
  const [dirty, setDirty] = useState(false)
  const [renderEditor, setRenderEditor] = useState(false)
  const [error, setError, setErrorImmediate, cancelSetError] =
    useDebouncedState(undefined, 1000)
  const [responsiveDesignMode, setResponsiveDesignMode] = useState(
    initialResponsiveSize ? true : false
  )
  const [shouldClearOnUpdate, setShouldClearOnUpdate] = useState(true)
  const [isLoading, setIsLoading, setIsLoadingImmediate] = useDebouncedState(
    false,
    1000
  )
  const [responsiveSize, setResponsiveSize] = useState(
    initialResponsiveSize || DEFAULT_RESPONSIVE_SIZE
  )
  const [tailwindVersion, setTailwindVersion] = useState('3')

  const [jit, setJit] = useState(true)

  useEffect(() => {
    setDirty(true)
  }, [
    activeTab,
    size.layout,
    responsiveSize.width,
    responsiveSize.height,
    responsiveDesignMode,
    tailwindVersion,
  ])

  const [styles, setStyles] = useState({})

  useEffect(() => {
    window.addEventListener(
      'message',
      async (event) => {
        if (event && event.data) {
          if (event.data.name === 'styles') {
            let newStyles = event.data.styles

            delete newStyles['selectedNode']

            if (JSON.stringify(styles) !== JSON.stringify(newStyles)) {
              setStyles(newStyles)

              const req = newStyles.cssRequest

              console.log('compile css', req)

              onChange({
                html: req.html,
                css: req.css,
                config: req.config,
                skipIntelliSense: req.skipIntelliSense,
                tailwindVersion: toValidTailwindVersion(
                  req.tailwindVersion ? req.tailwindVersion : '3'
                ),
              })
            }
          }

          if (event.data.name === 'lsprequest') {
            let result = await requestResponse(worker.current, event.data.lsp)

            window.top.postMessage(
              {
                type: 'lspresponse',
                _id: event.data._id,
                data: result,
              },
              '*'
            )
          }
        }
      },
      false
    )
  }, [])

  const inject = useCallback((content) => {
    // previewRef.current.contentWindow.postMessage(content, '*')
    !content.error && setResult(content.css)

    const payload = {
      type: content.error ? 'cssCompilerError' : 'updateCss',
      css: content.css,
      error: content.error,
    }
    window.top.postMessage(payload, '*')
  }, [])

  async function compileNow(content) {
    if (content.config) {
      let validateResult = await validateJavaScript(content.config)
      if (!validateResult.isValid) {
        return setError({ ...validateResult.error, file: 'Config' })
      }
    }
    cancelSetError()
    setIsLoading(true)
    const { css, html, jit, canceled, error } = await requestResponse(
      worker.current,
      content
    )

    if (canceled) {
      inject({ error })
      return
    }
    setIsLoadingImmediate(false)
    if (error) {
      setError(error)
      inject({ error })
      return
    }
    setErrorImmediate()
    setJit(jit)
    if (css || html) {
      inject({ css, html })
    }
  }

  const compile = useCallback(debounce(compileNow, 1), [])

  const onChange = useCallback(
    (content) => {
      setDirty(true)
      compile({
        html: content.html,
        css: content.css,
        config: content.config,
        skipIntelliSense: content.skipIntelliSense,
        tailwindVersion: content.tailwindVersion,
      })
    },
    [inject, compile, jit, tailwindVersion]
  )

  useEffect(() => {
    worker.current = new Worker()
    return () => {
      worker.current.terminate()
    }
  }, [])

  useEffect(() => {
    if (!error) {
      return
    }

    console.error('Tailwind compiler error: ', error)
  }, [error])

  return <>Compiler</>
}

export default function App({ errorCode, ...props }) {
  if (errorCode) {
    return <Error statusCode={errorCode} />
  }
  return <Pen {...props} />
}
