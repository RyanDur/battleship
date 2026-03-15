import {render, screen} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {Connections} from './Connections'

type FlowPhase =
  | {phase: 'idle'}
  | {phase: 'creating'}
  | {phase: 'offer-ready'; code: string}
  | {phase: 'joining'}
  | {phase: 'answer-ready'; code: string}

const noop = () => {}

const defaultProps = {
  flow: {phase: 'idle'} as FlowPhase,
  peers: [] as {id: string; name?: string}[],
  onCreateOffer: noop,
  onJoinOffer: noop,
  onAcceptAnswer: noop,
  serviceOnline: true,
}

describe('Connections', () => {
  it('shows create and join options when service is online', () => {
    render(<Connections {...defaultProps} serviceOnline={true}/>)

    expect(screen.getByRole('button', {name: /create/i})).toBeInTheDocument()
    expect(screen.getByRole('button', {name: /join/i})).toBeInTheDocument()
  })

  it('hides connection UI when service is not online', () => {
    render(<Connections {...defaultProps} serviceOnline={false}/>)

    expect(screen.queryByRole('button', {name: /create/i})).not.toBeInTheDocument()
    expect(screen.queryByRole('button', {name: /join/i})).not.toBeInTheDocument()
  })

  it('clicking Create shows passphrase input', async () => {
    const user = userEvent.setup()
    render(<Connections {...defaultProps}/>)

    await user.click(screen.getByRole('button', {name: /create/i}))

    expect(screen.getByLabelText(/passphrase/i)).toBeInTheDocument()
  })

  it('submitting Create form calls onCreateOffer with passphrase', async () => {
    const user = userEvent.setup()
    const onCreateOffer = vi.fn()
    render(<Connections {...defaultProps} onCreateOffer={onCreateOffer}/>)

    await user.click(screen.getByRole('button', {name: /create/i}))
    await user.type(screen.getByLabelText(/passphrase/i), 'my-secret-passphrase')
    await user.click(screen.getByRole('button', {name: /generate/i}))

    expect(onCreateOffer).toHaveBeenCalledWith('my-secret-passphrase')
  })

  it('shows offer code when flow is offer-ready', () => {
    render(<Connections {...defaultProps} flow={{phase: 'offer-ready', code: 'abc123code'}}/>)

    expect(screen.getByText('abc123code')).toBeInTheDocument()
  })

  it('entering response code and submitting calls onAcceptAnswer', async () => {
    const user = userEvent.setup()
    const onAcceptAnswer = vi.fn()
    render(<Connections {...defaultProps} flow={{phase: 'offer-ready', code: 'abc123code'}} onAcceptAnswer={onAcceptAnswer}/>)

    await user.type(screen.getByLabelText(/response code/i), 'xyz789response')
    await user.click(screen.getByRole('button', {name: /connect/i}))

    expect(onAcceptAnswer).toHaveBeenCalledWith('xyz789response')
  })

  it('clicking Join shows passphrase and offer code inputs', async () => {
    const user = userEvent.setup()
    render(<Connections {...defaultProps}/>)

    await user.click(screen.getByRole('button', {name: /join/i}))

    expect(screen.getByLabelText(/passphrase/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/offer code/i)).toBeInTheDocument()
  })

  it('submitting Join form calls onJoinOffer with offer code and passphrase', async () => {
    const user = userEvent.setup()
    const onJoinOffer = vi.fn()
    render(<Connections {...defaultProps} onJoinOffer={onJoinOffer}/>)

    await user.click(screen.getByRole('button', {name: /join/i}))
    await user.type(screen.getByLabelText(/passphrase/i), 'my-secret-passphrase')
    await user.type(screen.getByLabelText(/offer code/i), 'abc123offercode')
    await user.click(screen.getByRole('button', {name: /join/i}))

    expect(onJoinOffer).toHaveBeenCalledWith('abc123offercode', 'my-secret-passphrase')
  })

  it('shows answer code when flow is answer-ready', () => {
    render(<Connections {...defaultProps} flow={{phase: 'answer-ready', code: 'response-code-xyz'}}/>)

    expect(screen.getByText('response-code-xyz')).toBeInTheDocument()
  })

  it('shows connected peer by name in peers list', () => {
    render(<Connections {...defaultProps} peers={[{id: 'peer1', name: 'Alice'}]}/>)

    expect(screen.getByText('Alice')).toBeInTheDocument()
  })

  it('shows peer without name as Unknown in peers list', () => {
    render(<Connections {...defaultProps} peers={[{id: 'peer1'}]}/>)

    expect(screen.getByText('Unknown')).toBeInTheDocument()
  })
})
