import h from 'snabbdom/h'
import Component from './component'
import Message from './message'
import { assign } from './util'


export default function connectToStore() {
  return function (baseComponent, mapStoreToProps) {

    function initState() {
      return {}
    }

    function connect({ on, props, state, msg }) {
      const { store } = props()

      on(props, externalProps => {
        return assign({}, state(), { externalProps })
      })

      on(store.state, storeState => {
        const mappedProps = mapStoreToProps(store)
        return assign({}, state(), { mappedProps })
      })

      on(Message.unhandled, m => msg.sendToParent(m))
    }

    function render({ state }) {
      const props = assign({}, state.externalProps, state.mappedProps)
      return baseComponent(props)
    }

    return function connectComponent(props) {
      const name = 'connect-' + (props.key === undefined ? baseComponent.name : props.key)
      return Component({ name, log: false, initState, props, connect, render })
    }

  }
}
