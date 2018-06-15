require('jsdom-global')()
global.requestAnimationFrame = (fn: Function) => setTimeout(fn, 1)

import * as expect from 'expect'
import { Component, h, startApp, Render, ConnectParams,
  RenderParams, VNode, Messages, Message, connectToStore, Store } from '..'


/** Utils **/

const snabbdomModules = [
  require('snabbdom/modules/class'),
  require('snabbdom/modules/props'),
  require('snabbdom/modules/attributes')
]

const button = (() => {
  function initState() { return {} }
  function connect() {}

  function render() {
    return h('button')
  }

  return function() {
    return Component({ name: 'button', initState, connect, render })
  }
})()


/** Tests **/

describe('Component', () => {


  afterEach(() => {
    document.body.innerHTML = ''
  })


  it('is a regular VDOM node', () => {

    expect(button().sel).toBe('component')

    startApp({ app: button(), elm: document.body, snabbdomModules })

    expect(document.body.firstElementChild!.tagName).toBe('COMPONENT')
    expect(document.body.firstElementChild!.firstElementChild!.tagName).toBe('BUTTON')
  })


  it('can render with a custom selector', () => {

    const table = (() => {
      function initState() { return {} }
      function connect() {}

      function render() {
        return h('button')
      }

      return function() {
        return Component({ sel: 'table.large', name: 'table', initState, connect, render })
      }
    })()

    expect(table().sel).toBe('table.large')

    startApp({ app: table(), elm: document.body, snabbdomModules })

    expect(document.body.firstElementChild!.tagName).toBe('TABLE')
    expect(document.body.firstElementChild!.className).toBe('large')
    expect(document.body.firstElementChild!.firstElementChild!.tagName).toBe('BUTTON')
  })


  it('can render one VNode with children', done => {

    let forceReRender: Function = () => {}

    const reRender = Message('reRender')

    const bag = (() => {

      function initState() { return {} }

      function connect({ on, msg }: ConnectParams<{}, {}>) {
        forceReRender = () => msg.send(reRender())

        on(reRender, () => ({ force: Date.now() }))
      }

      function render({ state }: RenderParams<{}, any>) {
        return h('div', [
          h('button'),
          null,
          h('div'),
          undefined,
          h('span')
        ])
      }

      return function() {
        return Component({ name: 'bag', initState, connect, render })
      }
    })()

    const app = bag()

    startApp({ app, elm: document.body, snabbdomModules })

    const comp = document.body.firstElementChild!.firstElementChild!
    expect(comp.tagName).toBe('DIV')
    expect(comp.children[0].tagName).toBe('BUTTON')
    expect(comp.children[1].tagName).toBe('DIV')
    expect(comp.children[2].tagName).toBe('SPAN')
    const buttonEl = comp.children[0]
    const spanEl = comp.children[2]

    Render.into(app, h('div'), done)
  })


  it('can render an Array of VNodes', done => {

    let forceReRender: Function = () => {}
    const reRender = Message('reRender')

    let destroyCalled = false

    const bag = (() => {

      function initState() { return {} }

      function connect({ on, msg }: ConnectParams<{}, {}>) {
        forceReRender = () => msg.send(reRender())

        on(reRender, () => ({ swap: true }))
      }

      function render({ state }: RenderParams<{}, any>) {
        return [
          h('button'),
          null,
          h(state.swap ? 'p' : 'div'),
          undefined,
          h('span', { hook: { destroy: () => destroyCalled = true } })
        ]
      }

      return function() {
        return Component({ name: 'bag', initState, connect, render })
      }
    })()

    const app = bag()

    startApp({ app, elm: document.body, snabbdomModules })

    const comp = document.body.firstElementChild!
    expect(comp.tagName).toBe('COMPONENT')
    expect(comp.children[0].tagName).toBe('BUTTON')
    expect(comp.children[1].tagName).toBe('DIV')
    expect(comp.children[2].tagName).toBe('SPAN')
    const buttonEl = comp.children[0]
    const spanEl = comp.children[2]

    forceReRender()

    requestAnimationFrame(() => {
      // The component node is stable
      const newComp = document.body.firstElementChild
      expect(newComp).toBe(comp)

      // Test the patching occurs properly
      expect(comp.children[0].tagName).toBe('BUTTON')
      expect(comp.children[1].tagName).toBe('P')
      expect(comp.children[2].tagName).toBe('SPAN')

      // No reason for these to have changed reference
      expect(comp.children[0]).toBe(buttonEl)
      expect(comp.children[2]).toBe(spanEl)

      // Destroy the component
      Render.into(app, h('div'), () => {
        expect(document.body.firstElementChild!.tagName).toBe('DIV')
        expect(destroyCalled).toBe(true)
        done()
      })
    })
  })


  it('can receive local messages', done => {

    let receivedClickMessage = false
    let receivedTouchStartMessage = false
    let stopListeningToClickNow: Function = () => {}

    const div = (() => {
      const clickMsg = Message<MouseEvent>('click')
      const touchStartMsg = Message<number, TouchEvent>('touchStart')
      const stopListeningToClick = Message('stopListeningToClick')

      type State = { listenToClick: boolean }
      function initState() { return { listenToClick: true } }

      function connect({ on, msg }: ConnectParams<{}, {}>) {
        stopListeningToClickNow = () => msg.send(stopListeningToClick())

        on(clickMsg, evt => {
          expect(evt.currentTarget).toExist()
          receivedClickMessage = true
        })

        on(touchStartMsg, (data, evt) => {
          expect(evt.currentTarget).toExist()
          expect(data).toBe(13)
          receivedTouchStartMessage = true
        })

        on(stopListeningToClick, () => ({ listenToClick: false }))
      }

      function render({ state }: RenderParams<{}, State>) {
        return h('div', {
          events: {
            click: state.listenToClick ? clickMsg : undefined,
            touchstart: touchStartMsg.with(13)
          }
        })
      }

      return function() {
        return Component<{}, State>({ name: 'div', initState, connect, render })
      }
    })()

    startApp({ app: div(), elm: document.body, snabbdomModules })

    const divEl = document.body.firstElementChild!.firstElementChild!

    expect(divEl.tagName).toBe('DIV')

    dispatchMouseEventOn(divEl, 'click')
    expect(receivedClickMessage).toBe(true)

    dispatchTouchEventOn(divEl, 'touchstart')
    expect(receivedTouchStartMessage).toBe(true)

    receivedClickMessage = false
    stopListeningToClickNow()

    requestAnimationFrame(() => {
      dispatchMouseEventOn(divEl, 'click')
      expect(receivedClickMessage).toBe(false)
      done()
    })
  })


  it('can forward some messages to its parent', () => {

    const local = Message<MouseEvent>('local')
    const forwarded = Message<MouseEvent>('forwarded')
    const unknown = Message<MouseEvent>('unknown')

    const receivedMessages: string[] = []

    const parent = (() => {

      type Props = { children: VNode[] }

      function initState() { return {} }

      function connect({ on }: ConnectParams<Props, {}>) {
        on(local, evt => {
          // Should not happen
          receivedMessages.push('parentLocal')
        })

        on(forwarded, evt => {
          expect(evt.currentTarget).toExist()
          receivedMessages.push('parentForwarded')
        })

        on(unknown, evt => {
          expect(evt.currentTarget).toExist()
          receivedMessages.push('parentUnknown')
        })

        on(Message.unhandled, message => {
          // Should not happen
          receivedMessages.push('parentUnhandled')
        })
      }

      function render({ props }: RenderParams<Props, {}>) {
        return h('div', props.children)
      }

      return function(props: Props) {
        return Component({ name: 'div', props, initState, connect, render })
      }
    })()


    const child = (() => {

      function initState() { return { bla: 33 } }

      function connect({ on, msg, state }: ConnectParams<{}, {}>) {
        on(local, evt => {
          expect(evt.currentTarget).toExist()
          receivedMessages.push('childLocal')
        })

        on(forwarded, evt => {
          expect(evt.currentTarget).toExist()
          receivedMessages.push('childForwarded')
          msg.sendToParent(forwarded(evt))
        })

        on(Message.unhandled, message => {
          expect(state()).toEqual({ bla: 33 })
          receivedMessages.push('childUnknown')
          msg.sendToParent(message)
        })
      }

      function render() {
        return h('div', {
          events: {
            mousedown: local,
            mouseup: forwarded,
            click: unknown
          }
        })
      }

      return function() {
        return Component({ name: 'div', initState, connect, render })
      }
    })()

    startApp({
      app: parent({ children: [child()] }),
      elm: document.body,
      snabbdomModules
    })

    const parentDiv = document.body.firstElementChild!.firstElementChild!
    const childDiv = parentDiv.firstElementChild!.firstElementChild!

    dispatchMouseEventOn(childDiv, 'mousedown')
    dispatchMouseEventOn(childDiv, 'mouseup')
    dispatchMouseEventOn(childDiv, 'click')

    expect(receivedMessages).toEqual([
      'childLocal',
      'childForwarded', 'parentForwarded',
      'childUnknown', 'parentUnknown'
    ])
  })


  it('can schedule DOM manipulations without causing layout trashing', done => {

    let calls: string[] = []
    let forceReRender: Function[] = []

    const input = (() => {
      const reRender = Message('reRender')

      function initState() { return {} }
      function connect({ msg, on }: ConnectParams<{}, {}>) {
        forceReRender.push(() => msg.send(reRender()))

        calls.push('connect')

        Render.scheduleDOMRead(() => {
          calls.push('scheduleDOMReadFromConnect')
        })

        on(reRender, () => ({ swap: true }))
      }

      function render() {
        calls.push('render')

        return h('input', {
          hook: {
            insert: onInsert,
            update: onUpdate
          }
        })
      }

      function onInsert(vnode: VNode.Assigned) {
        Render.scheduleDOMRead(() => {
          calls.push('scheduleDOMReadFromInsert')
          let height = vnode.elm.clientHeight

          Render.scheduleDOMWrite(() => {
            calls.push('scheduleDOMWriteFromInsert')
            ;(vnode.elm as HTMLElement).style.height = '' + height + 20

            Render.scheduleDOMRead(() => {
              calls.push('scheduleDOMReadFromInsert2')
            })

          })
        })

        calls.push('onInsert')
      }

      function onUpdate(_: {}, vnode: VNode.Assigned) {
        Render.scheduleDOMRead(() => {
          calls.push('scheduleDOMReadFromUpdate')
          let height = vnode.elm.clientHeight

          Render.scheduleDOMWrite(() => {
            calls.push('scheduleDOMWriteFromUpdate')
            ;(vnode.elm as HTMLElement).style.height = '' + height + 20

            Render.scheduleDOMRead(() => {
              calls.push('scheduleDOMReadFromUpdate2')
            })

          })
        })

        calls.push('onUpdate')
      }

      return function() {
        return Component({ name: 'input', initState, connect, render })
      }
    })()

    startApp({
      app: h('nav', [input(), input(), input()]),
      elm: document.body,
      snabbdomModules
    })

    expect(calls).toEqual([
      'connect', 'connect', 'connect',
      'render', 'onInsert', 'render', 'onInsert', 'render', 'onInsert',
      'scheduleDOMReadFromConnect', 'scheduleDOMReadFromConnect', 'scheduleDOMReadFromConnect',
      'scheduleDOMReadFromInsert', 'scheduleDOMReadFromInsert', 'scheduleDOMReadFromInsert',
      'scheduleDOMWriteFromInsert', 'scheduleDOMWriteFromInsert', 'scheduleDOMWriteFromInsert',
      'scheduleDOMReadFromInsert2', 'scheduleDOMReadFromInsert2', 'scheduleDOMReadFromInsert2'
    ])

    calls = []

    forceReRender.forEach(fn => fn())

    requestAnimationFrame(() => {
      expect(calls).toEqual([
        'render', 'onUpdate', 'render', 'onUpdate', 'render', 'onUpdate',
        'scheduleDOMReadFromUpdate', 'scheduleDOMReadFromUpdate', 'scheduleDOMReadFromUpdate',
        'scheduleDOMWriteFromUpdate', 'scheduleDOMWriteFromUpdate', 'scheduleDOMWriteFromUpdate',
        'scheduleDOMReadFromUpdate2', 'scheduleDOMReadFromUpdate2', 'scheduleDOMReadFromUpdate2'
      ])

      done()
    })

  })


  it('can pre-bind a message with its payload', done => {

    let compMsg: Messages
    const texts: string[] = []

    const ping = Message<string, MouseEvent>('ping')

    const comp = (() => {
      function initState() { return {} }

      function connect({ on, msg }: ConnectParams<{}, {}>) {
        compMsg = msg

        on(ping, (text, evt) => {
          expect(evt.currentTarget).toNotBe(undefined!)
          texts.push(text)
        })
      }

      function render() {
        return h('main', {
          events: { click: ping.with('ping') }
        })
      }

      return function() {
        return Component({ name: 'parent', initState, connect, render })
      }
    })()

    Render.into(document.body, comp(), () => {
      dispatchMouseEventOn(document.querySelector('main')!, 'click')

      expect(texts).toEqual(['ping'])

      compMsg.send(ping.with('pong')(new MouseEvent('click')))

      expect(texts).toEqual(['ping', 'pong'])

      done()
    })

  })


  it('can use any sort of Messages in an interop way', done => {

    const myBoundMessage: Message.OnePayload<MouseEvent> = Message<string, MouseEvent>('').with('ping')

    const myBoundNoArgMessage: Message.NoPayload = Message<string>('hey').with('oh')

    const myBoundOneArgMessage = Message<string, number>('hey').with('oh')

    const myBoundOneArgEventMessage = Message<string, MouseEvent>('hey').with('oh')

    const myRegularNoArgMessage: Message.NoPayload = Message('hey')

    h('div', {
      events: { click: myBoundOneArgEventMessage  }
    })

    // This should not compile as and event handler should either accept a NoPayload message or a OnePayload<Event> one
    // h('div', {
    //   events: { click: myBoundOneArgMessage  }
    // })

    // const comp = (() => {
    //   function initState() { return {} }

    //   const boundMessage = Message<string, number>('bound').with('')

    //   function connect({ on, msg }: ConnectParams<{}, {}>) {
    //     // This should print a console error as listening to a partially applied message makes no sense
    //     on(boundMessage, () => {})
    //   }

    //   function render() {
    //     return null
    //   }

    //   return function() {
    //     return Component({ name: '', initState, connect, render })
    //   }
    // })()

    // RenderInto(document.body, comp())
    //   .then(done)
    //   .catch(done)
    done()
  })


  it('can listen to any messages transiting through a DOM Element', done => {
    const receivedMessages: string[] = []

    const messageFromTheRight = Message<string, MouseEvent>('messageFromTheRight')
    const messageFromTheRight2 = Message<string, MouseEvent>('messageFromTheRight2')

    const leftEl = document.createElement('main')
    document.body.appendChild(leftEl)

    const rightEl = document.createElement('aside')
    document.body.appendChild(rightEl)

    const left = (() => {
      function initState() { return {} }

      function connect({ on, msg }: ConnectParams<{}, {}>) {

        on(msg.listenAt(rightEl), message => {

          if (message.is(messageFromTheRight)) {
            expect(message.payload[1].currentTarget).toExist()
            receivedMessages.push(message.payload[0])
          }
          
          else if (message.is(messageFromTheRight2)) {
            expect(message.payload[1].currentTarget).toExist()
            receivedMessages.push(message.payload[0])
          }
        })

      }

      function render({ msg }: RenderParams<{}, {}>) {
        return h('span')
      }

      return function() {
        return Component({ name: 'left', initState, connect, render })
      }
    })()

    const right = (() => {

      function initState() { return {} }

      function connect({ on, msg }: ConnectParams<{}, {}>) {

        on(Message.unhandled, payload => {
          msg.sendToParent(payload)
        })

      }

      function render() {
        return h('span#right', {
          events: {
            click: messageFromTheRight.with('hello'),
            mousedown: messageFromTheRight2.with('goodbye')
          }
        })
      }

      return function() {
        return Component({ name: 'right', initState, connect, render })
      }
    })()

    Render.into(rightEl, right())

    Render.into(leftEl, left(), () => {
      const rightSpan = rightEl.querySelector('#right')!

      dispatchMouseEventOn(rightSpan, 'click')
      dispatchMouseEventOn(rightSpan, 'mousedown')

      expect(receivedMessages).toEqual(['hello', 'goodbye'])

      done()
    })
  })


  it('only calls render when props and states significantly changed', done => {

    let parentRenderCount = 0
    let childRenderCount = 0 

    let parentMsg: Messages

    const updateParentStateWithNoop = Message('')
    const updateParentStateWithNewDate = Message('')
    const updateChildProp = Message('')
    const updateChildMessageProp = Message('')

    const onChildChange = Message<number>('')
    const onComplete = Message<number, string>('')

    const parent = (() => {
      type State = {
        childProp: number
        childMessageProp: number
      }

      function initState() {
        return {
          childProp: 10,
          childMessageProp: 100
        }
      }

      function connect({ on, msg, state }: ConnectParams<{}, {}>) {
        parentMsg = msg

        on(updateParentStateWithNoop, () => Object.assign({}, state()))

        on(updateParentStateWithNewDate, () => Object.assign({}, state(), { ts: Date.now() }))

        on(updateChildProp, () => Object.assign({}, state(), { childProp: 20 }))

        on(updateChildMessageProp, () => Object.assign({}, state(), { childMessageProp: 200 }))
      }

      function render({ props, state }: RenderParams<{}, State>) {
        parentRenderCount++

        return h('main', {},
          child({
            id: '33',
            childProp: state.childProp,
            onChange: onChildChange,
            onComplete: onComplete.with(state.childMessageProp)
          })
        )
      }

      return function() {
        return Component<{}, State>({ name: 'parent', initState, connect, render })
      }
    })()

    const child = (() => {
      type Props = {
        id: string
        childProp: number
        onChange: Message.OnePayload<number>
        onComplete: Message.OnePayload<string>
      }

      function initState() { return {} }

      function connect({ on, msg }: ConnectParams<Props, {}>) {}

      function render() {
        childRenderCount++
        return h('div')
      }

      return function(props: Props) {
        return Component<Props, {}>({ name: 'child', initState, props, connect, render })
      }
    })()

    const parent1 = parent()

    RenderInto(document.body, parent1)
      .then(() => {
        expect(parentRenderCount).toBe(1)
        expect(childRenderCount).toBe(1)
      })
      .then(() => RenderInto(parent1, parent1))
      .then(() => {
        expect(parentRenderCount).toBe(1)
        expect(childRenderCount).toBe(1)
      })
      .then(() => {
        parentMsg.send(updateParentStateWithNoop())
        return nextFrame().then(() => {
          expect(parentRenderCount).toBe(1, 'updateParentStateWithNoop - parent')
          expect(childRenderCount).toBe(1, 'updateParentStateWithNoop - child')
        })
      })
      .then(() => {
        parentMsg.send(updateParentStateWithNewDate())
        return nextFrame().then(() => {
          // The parent has a new state
          expect(parentRenderCount).toBe(2, 'updateParentStateWithNewDate - parent')
          // But the child still have the same props/state
          expect(childRenderCount).toBe(1, 'updateParentStateWithNewDate - child')
        })
      })
      .then(() => {
        parentMsg.send(updateChildProp())
        return nextFrame().then(() => {
          expect(parentRenderCount).toBe(3, 'updateChildProp - parent')
          expect(childRenderCount).toBe(2, 'updateChildProp - child')
        })
      })
      .then(() => {
        parentMsg.send(updateChildMessageProp())
        return nextFrame().then(() => {
          expect(parentRenderCount).toBe(4, 'updateChildMessageProp - parent')
          expect(childRenderCount).toBe(3, 'updateChildMessageProp - child')
        })
      })
      .then(done)
      .catch(err => console.error(err) && done())
  })

  it('can render nothing', done => {

    let renderPhase: number = -1

    const comp = (() => {

      type Props = {
        renderPhase: number
      }

      function initState() { return {} }

      function connect() {}

      function render({ props }: RenderParams<Props, {}>) {
        const { renderPhase } = props

        if (renderPhase === 0 || renderPhase === 2) return null
        if (renderPhase === 1 || renderPhase === 4) return h('div')
        if (renderPhase === 3) return undefined
      }

      return function(props: Props) {
        return Component<{}, {}>({ name: 'child', initState, props, connect, render })
      }
    })()

    let previousComp: VNode
    function renderNextPhase() {
      renderPhase++
      const newComp = comp({ renderPhase })
      const promise = RenderInto(previousComp || document.body, newComp)
      previousComp = newComp
      return promise
    }

    renderNextPhase()
      .then(() => {
        expect(document.body.firstElementChild!.tagName).toBe('COMPONENT')
        expect(document.body.firstElementChild!.firstElementChild).toBe(null!)
      })
      .then(renderNextPhase)
      .then(() => {
        expect(document.body.firstElementChild!.tagName).toBe('COMPONENT')
        expect(document.body.firstElementChild!.firstElementChild!.tagName).toBe('DIV')
      })
      .then(renderNextPhase)
      .then(() => {
        expect(document.body.firstElementChild!.tagName).toBe('COMPONENT')
        expect(document.body.firstElementChild!.firstElementChild).toBe(null!)
      })
      .then(renderNextPhase)
      .then(() => {
        expect(document.body.firstElementChild!.tagName).toBe('COMPONENT')
        expect(document.body.firstElementChild!.firstElementChild).toBe(null!)
      })
      .then(renderNextPhase)
      .then(() => {
        expect(document.body.firstElementChild!.tagName).toBe('COMPONENT')
        expect(document.body.firstElementChild!.firstElementChild!.tagName).toBe('DIV')
      })
      .then(_ => done())
      .catch(e => console.error(e) && done())
  })

  it('can render another component', done => {

    let childWasDestroyed = false
    const childDestroyed = Message('childDestroyed')

    const childComp = (() => {

      function initState() { return {} }

      function connect() {}

      function render({ msg }: RenderParams<{}, {}>) {
        return h('div', {
          hook: {
            destroy: () => msg.sendToParent(childDestroyed())
          }
        })
      }

      return function() {
        return Component<{}, {}>({ name: 'child', initState, connect, render })
      }
    })()

    const comp = (() => {

      function initState() { return {} }

      function connect({ on }: ConnectParams<{}, {}>) {
        on(childDestroyed, () => childWasDestroyed = true)
      }

      function render() {
        return childComp()
      }

      return function() {
        return Component<{}, {}>({ name: 'parent', initState, connect, render })
      }
    })()

    const app = comp()

    Render.into(document.body, app, () => {
      expect(document.body.firstElementChild!.tagName).toBe('COMPONENT')
      expect(document.body.firstElementChild!.firstElementChild!.tagName).toBe('COMPONENT')
      expect(document.body.firstElementChild!.firstElementChild!.firstElementChild!.tagName).toBe('DIV')

      // Destroy the component
      Render.into(app, h('div'), () => {
        expect(childWasDestroyed).toBe(true)
        done()
      })
    })

  })

  it('removes previously bound messages DOM listeners', done => {
    
    const clickPayloads: number[] = []
    const click = Message<number, MouseEvent>('click')

    const Button = (() => {

      type State = {
        currentPayload: number
      }

      function initState() {
        return {
          currentPayload: 0
        }
      }

      function connect({ on, state }: ConnectParams<{}, State>) {
        on(click, payload => {
          clickPayloads.push(payload)
          return { currentPayload: state().currentPayload + 1 }
        })
      }

      function render({ state }: RenderParams<{}, State>) {
        return h('button', { events: { click: click.with(state.currentPayload) } })
      }

      return function() {
        return Component<{}, {}>({ name: 'button', initState, connect, render })
      }
    })()

    const button = Button()

    RenderInto(document.body, button)
      .then(() => {
        const buttonEl = document.body.firstElementChild!.firstElementChild!

        expect(clickPayloads).toEqual([])

        dispatchMouseEventOn(buttonEl, 'click')

        expect(clickPayloads).toEqual([0])

        return nextFrame().then(() => buttonEl)
      })
      .then(buttonEl => {

        dispatchMouseEventOn(buttonEl, 'click')

        expect(clickPayloads).toEqual([0, 1])

        return nextFrame().then(() => buttonEl)
      })
      .then(buttonEl => {

        dispatchMouseEventOn(buttonEl, 'click')

        expect(clickPayloads).toEqual([0, 1, 2])
      })
      .then(done)
      .catch(done)
  })


  it('can be connected to a store via a Higher Order Component', done => {

    const renderedProps: Props[] = []

    const increaseBy = Message<number>('increaseBy')

    const initState = { num: 1 }

    const store = Store(initState, ({ on, state }) => {
      on(increaseBy, by => ({ num: state().num + by }))
    })

    type StoreType = typeof store

    type Props = {
      key?: string
      counter: number // From the store
      mode: '1' | '2' // From the direct parent
      opt?: string
    }

    const BaseComponent = (() => {

      function initState() { return {} }

      function connect({}: ConnectParams<Props, {}>) {}

      function render({ props }: RenderParams<Props, {}>) {
        renderedProps.push(props)
        return h('button')
      }

      return function(props: Props) {
        return Component<Props, {}>({ name: 'baseComponent', props, log: false, initState, connect, render })
      }
    })()

    const ConnectedComponent = connectToStore<StoreType>()(
      BaseComponent,
      store => ({ counter: store.state().num })
    )

    const initVDOM = ConnectedComponent({ key: 'daKey', mode: '1', store })

    RenderInto(document.body, initVDOM)
      .then(() => {
        expect(renderedProps).toEqual([{ key: 'daKey', mode: '1', counter: 1 }])
      })
      .then(() => {
        const newVDOM = ConnectedComponent({ key: 'daKey', mode: '1', store })
        return RenderInto(initVDOM, newVDOM).then(() => newVDOM)
      })
      .then(currentVDOM => {
        // This should be a noop as no props were changed
        expect(renderedProps).toEqual([{ key: 'daKey', mode: '1', counter: 1 }])
        renderedProps.length = 0

        const newVDOM = ConnectedComponent({ mode: '2', store })
        return RenderInto(currentVDOM, newVDOM)
      })
      .then(() => {
        expect(renderedProps).toEqual([{ mode: '2', counter: 1 }])
        renderedProps.length = 0
      })
      .then(() => {
        store.send(increaseBy(1))
        return nextFrame()
      })
      .then(() => {
        expect(renderedProps).toEqual([{ mode: '2', counter: 2 }])
        renderedProps.length = 0
      })
      .then(() => {
        store.send(increaseBy(0))
        return nextFrame()
      })
      .then(() => {
        // This should be a noop as the store state didn't change
        expect(renderedProps).toEqual([])
      })
      .then(done)
      .catch(done)
  })

  it('can receive messages from components wrapped with connectToStore', done => {

    const click = Message<MouseEvent>('click')

    const initState = {}

    const store = Store(initState, ({ on, state }) => {})

    type StoreType = typeof store

    type Props = {
      opt?: string
    }

    const BaseComponent = (() => {

      function initState() { return {} }

      function connect({on, msg}: ConnectParams<Props, {}>) {
        on(click, (m: any) => msg.sendToParent(click(m)))
      }

      function render() {
        return h('div', {
          attrs: {
            id: 'target'
          },
          events: {
            click
          }
        })
      }
    
      return function(props: Props) {
        return Component<Props, {}>({ name: 'baseComponent', props, initState, connect, render })
      }
    })()

    const WrappedComponent = connectToStore<StoreType>()(BaseComponent, store => ({}))

    const ParentComponent = (() => {

      function initState() { return {}}

      function connect({ on }: ConnectParams<Props, {}>) {
        on(click, evt => {
          expect(evt.currentTarget).toExist()
          done()
        })
      }

      function render({ props }: RenderParams<Props, {}>) {
        return WrappedComponent({store})
      }

      return function(props: Props) {
        return Component<Props, {}>({ name: 'parentComponent', props, initState, connect, render })
      }
    })()

    startApp({
      app: ParentComponent({}),
      elm: document.body,
      snabbdomModules
    })

    const targetDiv = document.body.firstElementChild!.firstElementChild!.firstElementChild!.firstElementChild!
    dispatchMouseEventOn(targetDiv, 'click')
  })


  it('can receive a synchronous message inside connect()', done => {

    const Comp = (() => {

      type State = {
        refreshed: boolean
      }

      const refresh = Message('refresh')

      function initState() {
        return {
          refreshed: false
        }
      }

      function connect({ on, msg, state }: ConnectParams<{}, State>) {
        on(refresh, () => ({ refreshed: true }))
        msg.send(refresh())
      }

      function render({ props }: RenderParams<{}, State>) {
        return h('div')
      }

      return function() {
        return Component<{}, State>({ name: 'Component', props: {}, initState, connect, render })
      }
    })()

    const comp = Comp()

    RenderInto(document.body, comp)
      .then(() => {
        expect(comp.data.component.store.state().refreshed).toBe(true)
      })
      .then(done)
      .catch(done)
  })


  // it('can create partially applied Messages at a fair speed', () => {
  //   const message = Message<[string, number]>('')

  //   for (let i = 0; i < 15; i++) {
  //     console.time(`Creating a Bound Message (${i})`)
  //     message.with('' + i)
  //     console.timeEnd(`Creating a Bound Message (${i})`)
  //   }
  // })


})



function nextFrame() {
  return new Promise(resolve => requestAnimationFrame(resolve))
}

function RenderInto(arg1: any, arg2: any) {
  return new Promise(resolve => Render.into(arg1, arg2, resolve))
}

function dispatchMouseEventOn(target: EventTarget, name: string) {
  const evt = new MouseEvent(name)
  target.dispatchEvent(evt)
}

function dispatchTouchEventOn(target: EventTarget, name: string) {
  const evt = document.createEvent('TouchEvent')
  evt.initEvent(name, true, true)
  target.dispatchEvent(evt)
}