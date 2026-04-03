/* eslint-disable react-hooks/set-state-in-effect */
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

export default function Dashboard() {
  const router = useRouter()
  const [username, setUsername] = useState<string | null>(null)

  useEffect(() => {
    const token = localStorage.getItem('hatch_token')
    if (!token) {
      router.push('/')
      return
    }

    // decode the JWT payload (not verification, just reading)
    const payload = JSON.parse(atob(token.split('.')[1]))
    setUsername(payload.username)
  }, [router])

  return (
    <div className="flex items-center justify-center min-h-screen">
      <p className="text-sm text-gray-500">
        logged in as <span className="text-white font-medium">{username}</span>
      </p>
    </div>
  )
}