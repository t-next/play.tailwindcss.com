import { useState, useRef, useEffect, useCallback } from 'react'
import Worker from 'worker-loader?publicPath=/_next/&filename=static/chunks/[name].[hash].js&chunkFilename=static/chunks/[id].[contenthash].worker.js!../workers/postcss.worker.js'
import { requestResponse } from '../utils/workers'
import { debounce } from 'debounce'
import useMedia from 'react-use/lib/useMedia'
import { validateJavaScript } from '../utils/validateJavaScript'
import { useDebouncedState } from '../hooks/useDebouncedState'
import { toValidTailwindVersion } from '../utils/toValidTailwindVersion'
import Head from 'next/head'

const HEADER_HEIGHT = 60 - 1
const TAB_BAR_HEIGHT = 40
const RESIZER_SIZE = 1
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
  const [tailwindVersion, setTailwindVersion] = useState('2')

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
      (event) => {
        // send a message back
        // event.ports[0].postMessage("Message back from the iframe");
        if (event && event.data) {
          if (event.data.name === 'styles') {
            let newStyles = event.data.styles

            delete newStyles['selectedNode']

            if (JSON.stringify(styles) !== JSON.stringify(newStyles)) {
              setStyles(newStyles)

              const req = newStyles.cssRequest

              onChange({
                html: req.html,
                css: req.css,
                config: req.config,
                skipIntelliSense: true,
                tailwindVersion: toValidTailwindVersion('2'),
              })
            }
          }
        }
      },
      false
    )
  })

  const inject = useCallback((content) => {
    // previewRef.current.contentWindow.postMessage(content, '*')
    setResult(content.css)

    const payload = {
      type: 'updateCss',
      css: content.css,
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
      return
    }
    setIsLoadingImmediate(false)
    if (error) {
      setError(error)
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
        skipIntelliSense: true,
        tailwindVersion,
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
