'use client'

import React from 'react'
import { ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'

type Props = {
  value: number // 0..100
  label?: string
  centerText?: string
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n))
}

export default function Gauge({ value, label = 'Closed Business', centerText }: Props) {
  const v = clamp(value, 0, 100)

  // Segments (rouge -> orange -> vert)
  const data = [
    { name: 'low', value: 40, color: '#ef4444' },
    { name: 'mid', value: 30, color: '#f59e0b' },
    { name: 'high', value: 30, color: '#10b981' },
  ]

  // Needle angle for semicircle: 180 (left) to 0 (right)
  const angle = 180 - (v * 180) / 100
  const rad = (Math.PI * angle) / 180
  const cx = 50
  const cy = 55
  const r = 38
  const x2 = cx + r * Math.cos(rad)
  const y2 = cy - r * Math.sin(rad)

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <div style={{ fontWeight: 700, marginBottom: 6 }}>{label}</div>

      <div style={{ width: '100%', height: '85%' }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              startAngle={180}
              endAngle={0}
              cx="50%"
              cy="60%"
              innerRadius="70%"
              outerRadius="95%"
              paddingAngle={2}
              stroke="none"
            >
              {data.map((d, i) => (
                <Cell key={i} fill={d.color} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* Needle */}
      <svg viewBox="0 0 100 100" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        <circle cx={cx} cy={cy} r="2.2" fill="#111827" />
        <line x1={cx} y1={cy} x2={x2} y2={y2} stroke="#111827" strokeWidth="2" />
      </svg>

      {/* Center text */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: '58%',
          transform: 'translateY(-50%)',
          textAlign: 'center',
          fontWeight: 800,
          fontSize: 18,
          color: '#0f172a',
        }}
      >
        {centerText ?? `${v.toFixed(0)}%`}
      </div>
    </div>
  )
}
