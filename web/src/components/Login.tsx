import { useState } from 'react'
import { api, setToken } from '../api'

interface Props {
  onAuthed: () => void
}

export default function Login({ onAuthed }: Props) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!username || !password) {
      setError('Введите логин и пароль.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const res = await api.login(username.trim(), password)
      setToken(res.token)
      onAuthed()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <div className="login-logo">
          <span className="logo-mark">▣</span>
          <h1>WEBAIAgent</h1>
          <p className="muted">менеджер ИИ-агента на базе opencode</p>
        </div>

        <label className="field">
          <span>Логин</span>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            autoFocus
          />
        </label>

        <label className="field">
          <span>Пароль</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </label>

        {error && <div className="error">{error}</div>}

        <button type="submit" className="btn btn-primary login-btn" disabled={busy}>
          {busy ? 'Вход…' : 'Войти'}
        </button>
      </form>
    </div>
  )
}