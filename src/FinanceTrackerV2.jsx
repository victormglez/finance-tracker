import { useState, useEffect, useMemo, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";

// ─── SUPABASE ─────────────────────────────────────────────────────────────────
const sb = createClient(
  "https://fdpxwdujrwpdukihvulj.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZkcHh3ZHVqcndwZHVraWh2dWxqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA0NDMxNDEsImV4cCI6MjA5NjAxOTE0MX0.r5YFOmWtlYh977bYmiZ7ZUGBI4g0rgkRpv_i-Scqga0",
);

// ─── DB HELPERS ───────────────────────────────────────────────────────────────
const db = {
  get: (table, q = {}) =>
    sb
      .from(table)
      .select(q.select || "*")
      .order(q.order || "created_at", { ascending: q.asc ?? true }),
  ins: (table, data) => sb.from(table).insert(data).select().single(),
  upd: (table, id, d) => sb.from(table).update(d).eq("id", id),
  del: (table, id) => sb.from(table).delete().eq("id", id),
};

// ─── THEME ────────────────────────────────────────────────────────────────────
const C = {
  bg: "#08080E",
  card: "#10101A",
  elevated: "#16162A",
  border: "#1E1E30",
  borderLight: "#2A2A40",
  text: "#EEEEFF",
  sub: "#7070A0",
  muted: "#40405A",
  accent: "#7C6FFF",
  accentDim: "rgba(124,111,255,0.12)",
  green: "#00D08A",
  greenDim: "rgba(0,208,138,0.12)",
  red: "#FF4B6B",
  redDim: "rgba(255,75,107,0.12)",
  orange: "#FF9F43",
  orangeDim: "rgba(255,159,67,0.12)",
  blue: "#54A0FF",
  gold: "#FFD700",
};

// ─── DATE HELPERS ─────────────────────────────────────────────────────────────
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const todayDate = () => new Date();
const parseDate = (str) => new Date(str + "T12:00:00");

// Given a billing cut day and payment day, calculate the next payment due date for a purchase made on `purchaseDate`
// Mexican credit card logic:
//   - purchases before cut date → belong to current cycle → due on payment day of next month
//   - purchases on/after cut date → belong to next cycle → due on payment day of the month after next
function calcPaymentDate(purchaseDate, cutDay, payDay) {
  const pd = parseDate(purchaseDate);
  const year = pd.getFullYear();
  const month = pd.getMonth(); // 0-based
  const day = pd.getDate();

  let cutMonth = month;
  let cutYear = year;

  // If purchase is before the cut date, it goes into the current cycle
  // If on or after, it goes into next cycle
  let cycleMonth, cycleYear;
  if (day < cutDay) {
    cycleMonth = month;
    cycleYear = year;
  } else {
    cycleMonth = month + 1;
    cycleYear = year;
    if (cycleMonth > 11) {
      cycleMonth = 0;
      cycleYear++;
    }
  }

  // Payment day is typically ~3 weeks after cut day, in the following month
  let payMonth = cycleMonth + 1;
  let payYear = cycleYear;
  if (payMonth > 11) {
    payMonth = 0;
    payYear++;
  }

  const maxDay = new Date(payYear, payMonth + 1, 0).getDate();
  const actualPayDay = Math.min(payDay, maxDay);

  const payDate = new Date(payYear, payMonth, actualPayDay);
  return `${payDate.getFullYear()}-${String(payDate.getMonth() + 1).padStart(2, "0")}-${String(actualPayDay).padStart(2, "0")}`;
}

// MSI payment date sequence starting from purchaseDate
function getMsiPaymentDates(purchaseDate, acc, numMonths) {
  if (!acc?.cutDay || !acc?.payDay) return [];
  const firstPayment = calcPaymentDate(purchaseDate, acc.cutDay, acc.payDay);
  const dates = [firstPayment];
  for (let i = 1; i < numMonths; i++) {
    const prev = parseDate(dates[i - 1]);
    const next = new Date(prev.getFullYear(), prev.getMonth() + 1, acc.payDay);
    const maxDay = new Date(
      next.getFullYear(),
      next.getMonth() + 1,
      0,
    ).getDate();
    const d = Math.min(acc.payDay, maxDay);
    dates.push(
      `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
    );
  }
  return dates;
}

// Days until a date
function daysUntil(dateStr) {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const target = parseDate(dateStr);
  target.setHours(0, 0, 0, 0);
  return Math.round((target - now) / 86400000);
}

// Format date nicely
function fmtDate(str) {
  return parseDate(str).toLocaleDateString("es-MX", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
function fmtDateShort(str) {
  return parseDate(str).toLocaleDateString("es-MX", {
    day: "numeric",
    month: "short",
  });
}

// Get next occurrence of day-of-month from today
function nextOccurrence(dayOfMonth) {
  const now = new Date();
  let d = new Date(now.getFullYear(), now.getMonth(), dayOfMonth);
  if (d <= now) d = new Date(now.getFullYear(), now.getMonth() + 1, dayOfMonth);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(dayOfMonth).padStart(2, "0")}`;
}

function getCurrentMonth() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}`;
}

// ─── INITIAL DATA ─────────────────────────────────────────────────────────────
const INIT_ACCOUNTS = [
  {
    id: 1,
    name: "Nómina",
    type: "debit",
    balance: 187.0,
    limit: null,
    color: "#4CAF50",
    cutDay: null,
    payDay: null,
  },
  {
    id: 2,
    name: "BBVA",
    type: "credit",
    balance: -20555.99,
    limit: 87200,
    color: "#1976D2",
    cutDay: 12,
    payDay: 7,
  },
  {
    id: 3,
    name: "NU",
    type: "credit",
    balance: -1130.0,
    limit: 13800,
    color: "#820AD1",
    cutDay: 23,
    payDay: 16,
  },
  {
    id: 4,
    name: "LikeU",
    type: "credit",
    balance: -996.48,
    limit: 3000,
    color: "#FF6B35",
    cutDay: 18,
    payDay: 12,
  },
  {
    id: 5,
    name: "AMEX",
    type: "credit",
    balance: -3341.18,
    limit: 30000,
    color: "#00796B",
    cutDay: 20,
    payDay: 15,
  },
];

const INIT_CATEGORIES = [
  { id: 1, name: "Gastos Fijos", icon: "🏠", color: "#FF5252", budget: 2500 },
  {
    id: 2,
    name: "Gastos Variables",
    icon: "🛒",
    color: "#FF9800",
    budget: 18000,
  },
  { id: 3, name: "Citas", icon: "💕", color: "#E91E63", budget: 5000 },
  { id: 4, name: "Ahorro", icon: "💰", color: "#4CAF50", budget: 6000 },
];

// Subscriptions include chargeDay (day of month they charge)
const INIT_SUBS = [
  {
    id: 1,
    name: "Telcel",
    amount: 599.0,
    frequency: "monthly",
    categoryId: 1,
    accountId: 2,
    chargeDay: 5,
    color: "#1976D2",
    active: true,
  },
  {
    id: 2,
    name: "Spotify",
    amount: 120.0,
    frequency: "monthly",
    categoryId: 1,
    accountId: 3,
    chargeDay: 15,
    color: "#1DB954",
    active: true,
  },
  {
    id: 3,
    name: "iCloud",
    amount: 49.0,
    frequency: "monthly",
    categoryId: 1,
    accountId: 3,
    chargeDay: 3,
    color: "#555555",
    active: true,
  },
  {
    id: 4,
    name: "Google One",
    amount: 59.0,
    frequency: "monthly",
    categoryId: 1,
    accountId: 2,
    chargeDay: 22,
    color: "#4285F4",
    active: true,
  },
  {
    id: 5,
    name: "Crossfit",
    amount: 1490.0,
    frequency: "monthly",
    categoryId: 1,
    accountId: 2,
    chargeDay: 1,
    color: "#FF6B35",
    active: true,
  },
];

const INIT_EXPENSES = [
  {
    id: 1,
    description: "VISA Canadá",
    amount: 88.09,
    date: "2026-06-30",
    accountId: 3,
    categoryId: 2,
  },
  {
    id: 2,
    description: "Claude AI",
    amount: 344.26,
    date: "2026-06-25",
    accountId: 4,
    categoryId: 1,
  },
  {
    id: 3,
    description: "Desayuno Día de Madres",
    amount: 849.2,
    date: "2026-06-18",
    accountId: 2,
    categoryId: 2,
  },
  {
    id: 4,
    description: "Costco Galletas",
    amount: 183.11,
    date: "2026-06-18",
    accountId: 2,
    categoryId: 2,
  },
  {
    id: 5,
    description: "Carnicería",
    amount: 446.66,
    date: "2026-06-18",
    accountId: 2,
    categoryId: 2,
  },
  {
    id: 6,
    description: "Tacos Culichi",
    amount: 444.4,
    date: "2026-06-18",
    accountId: 2,
    categoryId: 3,
  },
  {
    id: 7,
    description: "Cinturón y Cinta",
    amount: 913.17,
    date: "2026-06-18",
    accountId: 3,
    categoryId: 2,
  },
  {
    id: 8,
    description: "Spartan SLP",
    amount: 2258.19,
    date: "2026-06-18",
    accountId: 5,
    categoryId: 2,
  },
  {
    id: 9,
    description: "Gasolina",
    amount: 1200.0,
    date: "2026-06-10",
    accountId: 2,
    categoryId: 2,
  },
  {
    id: 10,
    description: "Netflix",
    amount: 219.0,
    date: "2026-06-05",
    accountId: 2,
    categoryId: 1,
  },
];

const INIT_GOALS = [
  {
    id: 1,
    name: "Cajita Turbo",
    target: 25000,
    current: 25000,
    icon: "🚀",
    color: "#00D08A",
  },
  {
    id: 2,
    name: "Anillo",
    target: 50000,
    current: 49437.42,
    icon: "💍",
    color: "#FFD700",
  },
  {
    id: 3,
    name: "Boda",
    target: 200000,
    current: 29260.78,
    icon: "💒",
    color: "#FF6B9D",
  },
  {
    id: 4,
    name: "Fondo de Emergencia",
    target: 50000,
    current: 9320.54,
    icon: "🛡️",
    color: "#FF5252",
  },
];

const INIT_MSI = [
  {
    id: 1,
    desc: "Monitor Samsung",
    total: 942.0,
    monthly: 78.5,
    totalM: 12,
    paidM: 12,
    accountId: 2,
  },
  {
    id: 2,
    desc: "RTX 5070",
    total: 1287.0,
    monthly: 107.25,
    totalM: 18,
    paidM: 12,
    accountId: 2,
  },
  {
    id: 3,
    desc: "Seguro Coche",
    total: 2258.0,
    monthly: 376.33,
    totalM: 6,
    paidM: 6,
    accountId: 2,
  },
  {
    id: 4,
    desc: "Wallet North Face",
    total: 203.0,
    monthly: 67.67,
    totalM: 3,
    paidM: 3,
    accountId: 2,
  },
  {
    id: 5,
    desc: "Plan de Retiro 26-27",
    total: 1989.64,
    monthly: 165.8,
    totalM: 12,
    paidM: 3,
    accountId: 2,
  },
];

const MONTHLY_CHART = [
  { month: "Ene", total: 8200 },
  { month: "Feb", total: 9600 },
  { month: "Mar", total: 8800 },
  { month: "Abr", total: 14000 },
  { month: "May", total: 28000 },
  { month: "Jun", total: 6700 },
];

const mxn = (n, compact = false) => {
  const abs = Math.abs(n);
  if (compact && abs >= 1000) return `$${(abs / 1000).toFixed(1)}K`;
  const formatted = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(n));
  return (n < 0 ? "-$" : "$") + formatted;
};
const utilColor = (p) => (p < 30 ? C.green : p < 60 ? C.orange : C.red);
const utilPct = (b, l) => (l ? (Math.abs(b) / l) * 100 : 0);

// ─── UI PRIMITIVES ─────────────────────────────────────────────────────────────
function ProgressBar({ pct, color = C.accent, h = 6 }) {
  return (
    <div
      style={{
        background: C.border,
        borderRadius: 99,
        height: h,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          width: `${Math.min(pct, 100)}%`,
          height: "100%",
          background: color,
          borderRadius: 99,
          transition: "width .6s ease",
        }}
      />
    </div>
  );
}
function Tag({ children, color }) {
  return (
    <span
      style={{
        background: color + "22",
        color,
        fontSize: 10,
        fontWeight: 700,
        padding: "2px 6px",
        borderRadius: 4,
      }}
    >
      {children}
    </span>
  );
}
function Badge({ children, color = C.orange }) {
  return (
    <span
      style={{
        background: color + "22",
        color,
        fontSize: 9,
        fontWeight: 800,
        padding: "2px 7px",
        borderRadius: 99,
        letterSpacing: 0.3,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

function Modal({ open, onClose, title, children }) {
  if (!open) return null;
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "rgba(0,0,0,.8)",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        backdropFilter: "blur(4px)",
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        style={{
          background: C.elevated,
          borderRadius: "22px 22px 0 0",
          width: "100%",
          maxWidth: 480,
          maxHeight: "92vh",
          padding: 22,
          paddingTop: 10,
          paddingBottom: "calc(22px + env(safe-area-inset-bottom, 0px))",
          overflowY: "auto",
          border: `1px solid ${C.borderLight}`,
          borderBottom: "none",
          animation: "slideUp .28s cubic-bezier(.4,0,.2,1)",
        }}
      >
        <div
          style={{
            width: 36,
            height: 4,
            background: C.border,
            borderRadius: 99,
            margin: "0 auto 18px",
          }}
        />
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 20,
          }}
        >
          <span
            style={{
              fontSize: 17,
              fontWeight: 900,
              color: C.text,
              letterSpacing: -0.3,
            }}
          >
            {title}
          </span>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              color: C.sub,
              fontSize: 24,
              cursor: "pointer",
              lineHeight: 1,
              padding: 2,
            }}
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, hint, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: 6,
        }}
      >
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: C.sub,
            textTransform: "uppercase",
            letterSpacing: 0.8,
          }}
        >
          {label}
        </span>
        {hint && <span style={{ fontSize: 10, color: C.muted }}>{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function Input({ value, onChange, placeholder, type = "text", style = {} }) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      style={{
        width: "100%",
        background: C.card,
        border: `1px solid ${C.border}`,
        borderRadius: 10,
        padding: "10px 12px",
        color: C.text,
        fontSize: 14,
        outline: "none",
        boxSizing: "border-box",
        fontFamily: "inherit",
        ...style,
      }}
    />
  );
}

function Stepper({ value, onChange, min = 1, max = 31, label }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        background: C.card,
        borderRadius: 10,
        border: `1px solid ${C.border}`,
        padding: "6px 12px",
      }}
    >
      <button
        onClick={() => onChange(Math.max(min, value - 1))}
        style={{
          background: C.elevated,
          border: "none",
          borderRadius: 6,
          width: 28,
          height: 28,
          color: C.text,
          fontSize: 18,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        −
      </button>
      <span
        style={{
          flex: 1,
          textAlign: "center",
          fontSize: 20,
          fontWeight: 800,
          color: C.text,
        }}
      >
        {value}
      </span>
      <button
        onClick={() => onChange(Math.min(max, value + 1))}
        style={{
          background: C.elevated,
          border: "none",
          borderRadius: 6,
          width: 28,
          height: 28,
          color: C.text,
          fontSize: 18,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        +
      </button>
    </div>
  );
}

function ChipSelect({ options, value, onChange, getColor, getLabel }) {
  return (
    <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
      {options.map((opt) => {
        const key = opt.id ?? opt;
        const active = value === key;
        const col = getColor?.(opt) || C.accent;
        return (
          <button
            key={key}
            onClick={() => onChange(active ? null : key)}
            style={{
              padding: "6px 11px",
              borderRadius: 99,
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
              border: "none",
              background: active ? col : C.card,
              color: active ? "#fff" : C.sub,
              outline: active ? `1px solid ${col}` : `1px solid ${C.border}`,
              transition: "all .15s",
            }}
          >
            {getLabel?.(opt) || (opt.name ?? opt)}
          </button>
        );
      })}
    </div>
  );
}

function SaveBtn({ onClick, children, color = C.accent }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: "100%",
        background: color,
        border: "none",
        borderRadius: 12,
        padding: "13px 0",
        color: "#fff",
        fontSize: 14,
        fontWeight: 800,
        cursor: "pointer",
        marginTop: 8,
        letterSpacing: 0.3,
      }}
      onMouseEnter={(e) => (e.target.style.opacity = 0.85)}
      onMouseLeave={(e) => (e.target.style.opacity = 1)}
    >
      {children}
    </button>
  );
}

function NumberStepper({ value, onChange, min = 0, max = 999 }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 0,
        background: C.elevated,
        borderRadius: 10,
        overflow: "hidden",
        border: `1px solid ${C.border}`,
        width: "fit-content",
      }}
    >
      <button
        onClick={() => onChange(Math.max(min, value - 1))}
        style={{
          background: "none",
          border: "none",
          width: 38,
          height: 38,
          fontSize: 18,
          cursor: "pointer",
          color: C.text,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        −
      </button>
      <div
        style={{
          minWidth: 32,
          textAlign: "center",
          fontSize: 15,
          fontWeight: 800,
          color: C.text,
        }}
      >
        {value}
      </div>
      <button
        onClick={() => onChange(Math.min(max, value + 1))}
        style={{
          background: "none",
          border: "none",
          width: 38,
          height: 38,
          fontSize: 18,
          cursor: "pointer",
          color: C.text,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        +
      </button>
    </div>
  );
}

// ─── ACCOUNT CARD ─────────────────────────────────────────────────────────────
function AccountCard({ acc, onClick }) {
  const pct = acc.type === "credit" ? utilPct(acc.balance, acc.limit) : null;
  const nextCut = acc.cutDay ? nextOccurrence(acc.cutDay) : null;
  const nextPay = acc.payDay ? nextOccurrence(acc.payDay) : null;
  const dCut = nextCut ? daysUntil(nextCut) : null;
  const dPay = nextPay ? daysUntil(nextPay) : null;
  return (
    <div
      onClick={onClick}
      style={{
        background: C.card,
        borderRadius: 18,
        padding: 14,
        border: `1px solid ${C.border}`,
        borderLeft: `3px solid ${acc.color}`,
        cursor: "pointer",
        transition: "transform .1s",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.transform = "scale(1.02)")}
      onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          marginBottom: 8,
        }}
      >
        <span style={{ fontSize: 18 }}>
          {acc.type === "debit" ? "🏦" : "💳"}
        </span>
        <span style={{ fontSize: 12, fontWeight: 800, color: C.text }}>
          {acc.name}
        </span>
        <span
          style={{
            marginLeft: "auto",
            fontSize: 9,
            background: acc.type === "debit" ? C.greenDim : C.accentDim,
            color: acc.type === "debit" ? C.green : C.accent,
            padding: "1px 5px",
            borderRadius: 4,
            fontWeight: 700,
          }}
        >
          {acc.type === "debit" ? "Débito" : "Crédito"}
        </span>
      </div>
      <div
        style={{
          fontSize: 17,
          fontWeight: 900,
          color: acc.balance >= 0 ? C.text : C.red,
          marginBottom: pct !== null ? 8 : 0,
        }}
      >
        {acc.type === "credit" ? mxn(Math.abs(acc.balance)) : mxn(acc.balance)}
      </div>
      {pct !== null && (
        <>
          <ProgressBar pct={pct} color={utilColor(pct)} h={4} />
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: utilColor(pct),
              marginTop: 3,
            }}
          >
            {pct.toFixed(1)}% utilizado
          </div>
        </>
      )}
      {acc.cutDay && (
        <div
          style={{ marginTop: 6, display: "flex", gap: 4, flexWrap: "wrap" }}
        >
          {dCut !== null && (
            <Badge color={C.orange}>
              Corte: {dCut === 0 ? "Hoy" : `${dCut}d`}
            </Badge>
          )}
          {dPay !== null && (
            <Badge color={dPay <= 3 ? C.red : C.blue}>
              Pago: {dPay === 0 ? "Hoy" : `${dPay}d`}
            </Badge>
          )}
        </div>
      )}
    </div>
  );
}

// ─── ADD / EDIT ACCOUNT MODAL ─────────────────────────────────────────────────
function AccountModal({ open, onClose, onSave, onDelete, editAccount = null }) {
  const isEdit = !!editAccount;
  const COLORS = [
    "#4CAF50",
    "#1976D2",
    "#820AD1",
    "#FF6B35",
    "#00796B",
    "#FF5252",
    "#FF9F43",
    "#54A0FF",
    "#E91E63",
    "#7C6FFF",
  ];

  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    name: "",
    type: "debit",
    limit: "",
    color: "#4CAF50",
    cutDay: 12,
    payDay: 7,
    balance: "",
  });

  // When modal opens, populate form from editAccount if editing
  useEffect(() => {
    if (open) {
      if (isEdit) {
        setForm({
          name: editAccount.name,
          type: editAccount.type,
          limit: editAccount.limit != null ? String(editAccount.limit) : "",
          color: editAccount.color,
          cutDay: editAccount.cutDay || 12,
          payDay: editAccount.payDay || 7,
          balance: String(editAccount.balance),
        });
        setStep(1);
      } else {
        setForm({
          name: "",
          type: "debit",
          limit: "",
          color: "#4CAF50",
          cutDay: 12,
          payDay: 7,
          balance: "0",
        });
        setStep(1);
      }
    }
  }, [open]);

  const reset = () => {
    setStep(1);
  };
  const handleClose = () => {
    reset();
    onClose();
  };
  const isCredit = form.type === "credit";

  const save = () => {
    if (!form.name.trim()) return;
    onSave({
      ...form,
      limit: isCredit ? parseFloat(form.limit) || 0 : null,
      balance: parseFloat(form.balance) || 0,
      cutDay: isCredit ? form.cutDay : null,
      payDay: isCredit ? form.payDay : null,
    });
    handleClose();
  };

  const titleMap = isEdit
    ? { 1: "Editar Cuenta", 2: "Ciclo de Facturación", 3: "Color" }
    : { 1: "Nueva Cuenta", 2: "Límite y Ciclo", 3: "Color" };

  return (
    <Modal open={open} onClose={handleClose} title={titleMap[step] || "Cuenta"}>
      {step === 1 && (
        <>
          <Field label="Nombre de la cuenta">
            <Input
              value={form.name}
              onChange={(v) => setForm((f) => ({ ...f, name: v }))}
              placeholder="Ej. BBVA, Nu, AMEX..."
            />
          </Field>

          {/* Only allow type change when creating */}
          {!isEdit && (
            <Field label="Tipo de cuenta">
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 10,
                }}
              >
                {[
                  {
                    type: "debit",
                    icon: "🏦",
                    label: "Débito",
                    desc: "Saldo disponible",
                  },
                  {
                    type: "credit",
                    icon: "💳",
                    label: "Crédito",
                    desc: "Línea de crédito",
                  },
                ].map((opt) => {
                  const active = form.type === opt.type;
                  return (
                    <button
                      key={opt.type}
                      onClick={() => setForm((f) => ({ ...f, type: opt.type }))}
                      style={{
                        background: active ? C.accentDim : C.card,
                        border: active
                          ? `1.5px solid ${C.accent}`
                          : `1px solid ${C.border}`,
                        borderRadius: 14,
                        padding: "14px 10px",
                        cursor: "pointer",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: 6,
                      }}
                    >
                      <span style={{ fontSize: 28 }}>{opt.icon}</span>
                      <span
                        style={{
                          fontSize: 13,
                          fontWeight: 800,
                          color: active ? C.accent : C.text,
                        }}
                      >
                        {opt.label}
                      </span>
                      <span style={{ fontSize: 10, color: C.sub }}>
                        {opt.desc}
                      </span>
                    </button>
                  );
                })}
              </div>
            </Field>
          )}

          {/* When editing, show type as read-only badge */}
          {isEdit && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                background: C.card,
                borderRadius: 10,
                padding: "10px 14px",
                marginBottom: 14,
                border: `1px solid ${C.border}`,
              }}
            >
              <span style={{ fontSize: 20 }}>
                {form.type === "debit" ? "🏦" : "💳"}
              </span>
              <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>
                {form.type === "debit" ? "Cuenta Débito" : "Tarjeta de Crédito"}
              </span>
              <span
                style={{ marginLeft: "auto", fontSize: 10, color: C.muted }}
              >
                no editable
              </span>
            </div>
          )}

          <Field
            label={
              form.type === "debit"
                ? "Saldo actual (MXN)"
                : "Saldo / Deuda actual (MXN)"
            }
          >
            <Input
              value={form.balance}
              onChange={(v) => setForm((f) => ({ ...f, balance: v }))}
              placeholder={form.type === "debit" ? "1500.00" : "-5200.00"}
              type="number"
            />
            {form.type === "credit" && (
              <p style={{ fontSize: 11, color: C.sub, margin: "5px 0 0" }}>
                Usa número negativo para deuda (ej. -5200)
              </p>
            )}
          </Field>

          <div style={{ display: "flex", gap: 8 }}>
            {isEdit && onDelete && (
              <button
                onClick={() => {
                  if (window.confirm("¿Eliminar esta cuenta?")) onDelete();
                }}
                style={{
                  flex: 1,
                  background: C.redDim,
                  border: `1px solid ${C.red}44`,
                  borderRadius: 12,
                  padding: "12px 0",
                  color: C.red,
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                🗑
              </button>
            )}
            <button
              onClick={() => setStep(isCredit ? 2 : 3)}
              style={{
                flex: 3,
                background: C.accent,
                border: "none",
                borderRadius: 12,
                padding: "12px 0",
                color: "#fff",
                fontSize: 13,
                fontWeight: 800,
                cursor: "pointer",
              }}
            >
              Siguiente →
            </button>
          </div>
        </>
      )}

      {step === 2 && isCredit && (
        <>
          <Field label="Límite de crédito (MXN)">
            <Input
              value={form.limit}
              onChange={(v) => setForm((f) => ({ ...f, limit: v }))}
              placeholder="Ej. 30000"
              type="number"
            />
          </Field>
          <Field label="Día de corte" hint="Fin del ciclo de facturación">
            <Stepper
              value={form.cutDay}
              onChange={(v) => setForm((f) => ({ ...f, cutDay: v }))}
            />
            <p style={{ fontSize: 11, color: C.sub, margin: "6px 0 0" }}>
              Gastos antes del día{" "}
              <b style={{ color: C.orange }}>{form.cutDay}</b> entran al ciclo
              actual
            </p>
          </Field>
          <Field
            label="Día límite de pago"
            hint="Fecha máxima para pagar sin intereses"
          >
            <Stepper
              value={form.payDay}
              onChange={(v) => setForm((f) => ({ ...f, payDay: v }))}
            />
            <p style={{ fontSize: 11, color: C.sub, margin: "6px 0 0" }}>
              Tu pago vence el <b style={{ color: C.red }}>día {form.payDay}</b>{" "}
              de cada mes
            </p>
          </Field>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => setStep(1)}
              style={{
                flex: 1,
                background: C.card,
                border: `1px solid ${C.border}`,
                borderRadius: 12,
                padding: "12px 0",
                color: C.sub,
                fontSize: 13,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              ← Atrás
            </button>
            <button
              onClick={() => setStep(3)}
              style={{
                flex: 2,
                background: C.accent,
                border: "none",
                borderRadius: 12,
                padding: "12px 0",
                color: "#fff",
                fontSize: 13,
                fontWeight: 800,
                cursor: "pointer",
              }}
            >
              Siguiente →
            </button>
          </div>
        </>
      )}

      {step === 3 && (
        <>
          <Field label="Color de la tarjeta">
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 10,
                justifyContent: "center",
                padding: "8px 0",
              }}
            >
              {COLORS.map((col) => (
                <button
                  key={col}
                  onClick={() => setForm((f) => ({ ...f, color: col }))}
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 20,
                    background: col,
                    border: "none",
                    cursor: "pointer",
                    outline:
                      form.color === col
                        ? "3px solid #fff"
                        : "2px solid transparent",
                    outlineOffset: 2,
                    transition: "all .15s",
                  }}
                />
              ))}
            </div>
          </Field>
          {/* Live preview */}
          <div
            style={{
              background: C.card,
              borderRadius: 14,
              padding: 14,
              border: `1px solid ${C.border}`,
              borderLeft: `3px solid ${form.color}`,
              marginBottom: 16,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 6,
              }}
            >
              <span style={{ fontSize: 20 }}>
                {form.type === "debit" ? "🏦" : "💳"}
              </span>
              <span style={{ fontSize: 15, fontWeight: 800, color: C.text }}>
                {form.name || "Mi Cuenta"}
              </span>
              <span
                style={{
                  marginLeft: "auto",
                  fontSize: 9,
                  background: form.color + "22",
                  color: form.color,
                  padding: "2px 6px",
                  borderRadius: 4,
                  fontWeight: 700,
                }}
              >
                {form.type === "debit" ? "Débito" : "Crédito"}
              </span>
            </div>
            {form.balance !== "" && (
              <div
                style={{
                  fontSize: 16,
                  fontWeight: 800,
                  color: parseFloat(form.balance) >= 0 ? C.text : C.red,
                }}
              >
                {mxn(parseFloat(form.balance) || 0)}
              </div>
            )}
            {isCredit && (
              <div style={{ fontSize: 11, color: C.sub, marginTop: 4 }}>
                Corte: día {form.cutDay} · Pago: día {form.payDay}
              </div>
            )}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => setStep(isCredit ? 2 : 1)}
              style={{
                flex: 1,
                background: C.card,
                border: `1px solid ${C.border}`,
                borderRadius: 12,
                padding: "12px 0",
                color: C.sub,
                fontSize: 13,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              ← Atrás
            </button>
            <button
              onClick={save}
              style={{
                flex: 2,
                background: form.color,
                border: "none",
                borderRadius: 12,
                padding: "12px 0",
                color: "#fff",
                fontSize: 13,
                fontWeight: 800,
                cursor: "pointer",
              }}
            >
              {isEdit ? "✓ Guardar Cambios" : "✓ Crear Cuenta"}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}

// ─── UPCOMING PAYMENTS SECTION ────────────────────────────────────────────────
function UpcomingPayments({ expenses, accounts, subs }) {
  // For each credit card, group expenses and compute next payment date
  const creditAccounts = accounts.filter(
    (a) => a.type === "credit" && a.cutDay && a.payDay,
  );

  const paymentGroups = creditAccounts
    .map((acc) => {
      const accExp = expenses.filter((e) => e.accountId === acc.id);
      if (accExp.length === 0) return null;
      // Group by payment date
      const byPayDate = {};
      accExp.forEach((exp) => {
        const pd = calcPaymentDate(exp.date, acc.cutDay, acc.payDay);
        if (!byPayDate[pd]) byPayDate[pd] = { amount: 0, count: 0 };
        byPayDate[pd].amount += exp.amount;
        byPayDate[pd].count += 1;
      });
      return { acc, byPayDate };
    })
    .filter(Boolean);

  // Also include subscription next charges
  const subCharges = subs
    .filter((s) => s.active)
    .map((sub) => {
      const acc = accounts.find((a) => a.id === sub.accountId);
      const nextCharge = nextOccurrence(sub.chargeDay);
      const d = daysUntil(nextCharge);
      return { sub, acc, nextCharge, daysAway: d };
    })
    .sort((a, b) => a.daysAway - b.daysAway);

  if (paymentGroups.length === 0 && subCharges.length === 0) return null;

  return (
    <div style={{ marginBottom: 24 }}>
      <div
        style={{
          fontSize: 13,
          fontWeight: 800,
          color: C.sub,
          textTransform: "uppercase",
          letterSpacing: 1,
          marginBottom: 12,
        }}
      >
        📅 Próximos Pagos
      </div>

      {/* Credit card payments */}
      {paymentGroups.map(({ acc, byPayDate }) =>
        Object.entries(byPayDate)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([pd, data]) => {
            const d = daysUntil(pd);
            const urgent = d <= 5;
            return (
              <div
                key={acc.id + pd}
                style={{
                  background: C.card,
                  borderRadius: 14,
                  padding: "12px 14px",
                  marginBottom: 8,
                  border: `1px solid ${urgent ? C.red + "55" : C.border}`,
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 12,
                    background: acc.color + "22",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 20,
                    flexShrink: 0,
                  }}
                >
                  💳
                </div>
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      marginBottom: 3,
                    }}
                  >
                    <span
                      style={{ fontSize: 13, fontWeight: 800, color: C.text }}
                    >
                      {acc.name}
                    </span>
                    <Tag color={acc.color}>
                      {data.count} cargo{data.count > 1 ? "s" : ""}
                    </Tag>
                  </div>
                  <div style={{ fontSize: 11, color: C.sub }}>
                    Vence: {fmtDate(pd)}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div
                    style={{
                      fontSize: 16,
                      fontWeight: 900,
                      color: urgent ? C.red : C.text,
                    }}
                  >
                    {mxn(data.amount)}
                  </div>
                  <div
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: urgent ? C.red : C.muted,
                    }}
                  >
                    {d === 0 ? "🔴 Hoy" : d < 0 ? `⚠️ Vencido` : `${d}d`}
                  </div>
                </div>
              </div>
            );
          }),
      )}

      {/* Subscription next charges */}
      {subCharges.slice(0, 3).map(({ sub, acc, nextCharge, daysAway }) => (
        <div
          key={sub.id}
          style={{
            background: C.card,
            borderRadius: 14,
            padding: "12px 14px",
            marginBottom: 8,
            border: `1px solid ${daysAway <= 3 ? C.orange + "55" : C.border}`,
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              background: C.accentDim,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 20,
              flexShrink: 0,
            }}
          >
            🔄
          </div>
          <div style={{ flex: 1 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                marginBottom: 3,
              }}
            >
              <span style={{ fontSize: 13, fontWeight: 800, color: C.text }}>
                {sub.name}
              </span>
              {daysAway <= 3 && <Badge color={C.orange}>Pronto</Badge>}
            </div>
            <div style={{ fontSize: 11, color: C.sub }}>
              Cargo: {fmtDate(nextCharge)} {acc && `· ${acc.name}`}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: C.text }}>
              {mxn(sub.amount)}
            </div>
            <div style={{ fontSize: 10, color: C.muted }}>
              {daysAway === 0 ? "Hoy" : `${daysAway}d`}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function SectionHead({
  label,
  count,
  extra,
  color = C.accent,
  onAdd,
  addLabel,
  isOpen,
  onToggle,
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        marginBottom: isOpen ? 0 : 10,
      }}
    >
      <button
        onClick={onToggle}
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          gap: 8,
          background: isOpen ? color + "11" : C.card,
          border: `1px solid ${isOpen ? color + "55" : C.border}`,
          borderRadius: isOpen ? "14px 14px 0 0" : 14,
          padding: "11px 14px",
          cursor: "pointer",
        }}
      >
        <span
          style={{
            flex: 1,
            textAlign: "left",
            fontSize: 13,
            fontWeight: 800,
            color: isOpen ? color : C.text,
          }}
        >
          {label}
        </span>
        {count != null && (
          <span
            style={{
              fontSize: 10,
              background: C.elevated,
              color: C.sub,
              padding: "2px 7px",
              borderRadius: 99,
              fontWeight: 700,
            }}
          >
            {count}
          </span>
        )}
        {extra && (
          <span style={{ fontSize: 11, color: C.sub, marginRight: 4 }}>
            {extra}
          </span>
        )}
        <span
          style={{
            fontSize: 13,
            color: C.sub,
            transition: "transform .2s",
            transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
          }}
        >
          ▾
        </span>
      </button>
      {onAdd && (
        <button
          onClick={onAdd}
          style={{
            marginLeft: 6,
            background: color,
            border: "none",
            borderRadius: 10,
            padding: "8px 10px",
            color: "#fff",
            fontSize: 11,
            fontWeight: 800,
            cursor: "pointer",
            whiteSpace: "nowrap",
            flexShrink: 0,
          }}
        >
          + {addLabel}
        </button>
      )}
    </div>
  );
}
function SectionBody({ isOpen, color = C.accent, children }) {
  return isOpen ? (
    <div
      style={{
        background: C.card,
        border: `1px solid ${color}33`,
        borderTop: "none",
        borderRadius: "0 0 14px 14px",
        padding: "10px 12px 12px",
        marginBottom: 12,
      }}
    >
      {children}
    </div>
  ) : null;
}

// ─── DASHBOARD ────────────────────────────────────────────────────────────────
function Dashboard({
  expenses,
  accounts,
  setAccounts,
  categories,
  setCategories,
  transfers,
  setTransfers,
  goalWithdrawals,
  goals,
  onAddAccount,
  onUpdateAccount,
  onDeleteAccount,
  session,
  reloadAll,
}) {
  const currentMonth = getCurrentMonth();
  const monthExp = expenses.filter(
    (e) => e.date.startsWith(currentMonth) && !e.isMSIInstallment,
  );
  const monthTotal = monthExp.reduce((s, e) => s + e.amount, 0);
  const catBreakdown = categories.map((cat) => ({
    ...cat,
    spent: monthExp
      .filter((e) => e.categoryId === cat.id)
      .reduce((s, e) => s + e.amount, 0),
  }));
  const realMonthlyChart = useMemo(
    () =>
      Array.from({ length: 6 }, (_, i) => {
        const d = new Date();
        d.setDate(1);
        d.setMonth(d.getMonth() - (5 - i));
        const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        const label = d
          .toLocaleDateString("es-MX", { month: "short" })
          .replace(".", "")
          .slice(0, 3);
        const cap = label.charAt(0).toUpperCase() + label.slice(1);
        const total = expenses
          .filter((e) => e.date.startsWith(ym) && !e.isMSIInstallment)
          .reduce((s, e) => s + e.amount, 0);
        return { month: cap, ym, total };
      }),
    [expenses],
  );
  const maxBar = Math.max(...realMonthlyChart.map((m) => m.total), 1);

  // ── Accounts ──
  const [showAddAcc, setShowAddAcc] = useState(false);
  const [editingAcc, setEditingAcc] = useState(null);

  // ── Transfers ──
  const [showAddTrans, setShowAddTrans] = useState(false);
  const [editingTrans, setEditingTrans] = useState(null);
  const emptyTransForm = {
    type: "received",
    amount: "",
    accountId: accounts[0]?.id || "",
    counterparty: "",
    date: today(),
    notes: "",
  };
  const [transForm, setTransForm] = useState(emptyTransForm);

  // ── Goal Withdrawals ──
  const [editingGW, setEditingGW] = useState(null);
  const [gwForm, setGwForm] = useState({ amount: "", date: "", concept: "", accountId: "" });
  const deleteGW = async (w) => {
    if (!window.confirm("¿Eliminar este retiro? El monto regresará a la meta.")) return;
    await sb.from("goal_withdrawals").delete().eq("id", w.id);
    const acc = accounts.find((a) => a.id === w.accountId);
    const goal = goals.find((g) => g.id === w.goalId);
    if (acc) await sb.from("accounts").update({ balance: acc.balance - w.amount }).eq("id", acc.id);
    if (goal) await sb.from("goals").update({ current_amount: goal.current + w.amount }).eq("id", goal.id);
    if (reloadAll) await reloadAll();
  };
  const updateGW = async () => {
    if (!editingGW) return;
    const newAmt = parseFloat(gwForm.amount);
    if (isNaN(newAmt) || newAmt <= 0) return;
    const origAcc = accounts.find((a) => a.id === editingGW.accountId);
    const newAcc = accounts.find((a) => a.id === gwForm.accountId);
    const goal = goals.find((g) => g.id === editingGW.goalId);
    await sb.from("goal_withdrawals").update({ amount: newAmt, date: gwForm.date, concept: gwForm.concept || null, account_id: gwForm.accountId }).eq("id", editingGW.id);
    if (origAcc?.id === newAcc?.id) {
      if (origAcc) await sb.from("accounts").update({ balance: origAcc.balance - editingGW.amount + newAmt }).eq("id", origAcc.id);
    } else {
      if (origAcc) await sb.from("accounts").update({ balance: origAcc.balance - editingGW.amount }).eq("id", origAcc.id);
      if (newAcc) await sb.from("accounts").update({ balance: newAcc.balance + newAmt }).eq("id", newAcc.id);
    }
    if (goal) await sb.from("goals").update({ current_amount: goal.current + editingGW.amount - newAmt }).eq("id", goal.id);
    setEditingGW(null);
    if (reloadAll) await reloadAll();
  };

  // ── Categories ──
  const [showAddCat, setShowAddCat] = useState(false);
  const [editingCat, setEditingCat] = useState(null);
  const [nextCatId, setNextCatId] = useState(20);
  const CAT_ICONS = [
    "🏠",
    "🛒",
    "💕",
    "💰",
    "🚗",
    "✈️",
    "🍔",
    "🏋️",
    "💊",
    "🎮",
    "👔",
    "📚",
    "🐾",
    "🎁",
    "⚡",
    "📱",
    "🏥",
    "🎵",
  ];
  const CAT_COLORS = [
    "#FF5252",
    "#FF9800",
    "#E91E63",
    "#4CAF50",
    "#1976D2",
    "#820AD1",
    "#FF6B35",
    "#00796B",
    "#FF9F43",
    "#54A0FF",
    "#7C6FFF",
    "#FFD700",
    "#00D08A",
    "#F06292",
    "#26C6DA",
    "#AB47BC",
  ];
  const emptyCatForm = { name: "", budget: "", icon: "🛒", color: "#FF9800" };
  const [catForm, setCatForm] = useState(emptyCatForm);

  // ── Accordion open states ──
  const [openSections, setOpenSections] = useState({
    accounts: true,
    transfers: false,
    withdrawals: false,
    cats: false,
  });
  const toggle = (k) => setOpenSections((s) => ({ ...s, [k]: !s[k] }));

  // ── Handlers ──
  // Delta = how much to change the account balance for a transfer.
  // Debit:  received → +amt (money comes in),  sent → -amt (money goes out)
  // Credit: received → -amt (refund reduces debt), sent → +amt (charge increases debt)
  const transDelta = (acc, isReceived, amount) =>
    acc.type === "credit"
      ? (isReceived ? -amount : amount)
      : (isReceived ? amount : -amount);

  const saveTrans = async () => {
    if (!transForm.amount || !transForm.counterparty.trim()) return;
    const amt = parseFloat(transForm.amount);
    if (isNaN(amt) || amt <= 0) return;
    const isRec = transForm.type === "received";
    await sb
      .from("transfers")
      .insert({
        user_id: session?.user?.id,
        type: transForm.type,
        amount: amt,
        account_id: transForm.accountId || null,
        counterparty: transForm.counterparty.trim(),
        date: transForm.date,
        notes: transForm.notes || null,
      });
    const acc = accounts.find((a) => a.id === transForm.accountId);
    if (acc)
      await sb
        .from("accounts")
        .update({ balance: acc.balance + transDelta(acc, isRec, amt) })
        .eq("id", acc.id);
    setTransForm(emptyTransForm);
    setShowAddTrans(false);
    if (reloadAll) await reloadAll();
  };
  const updateTrans = async () => {
    if (!transForm.amount || !transForm.counterparty.trim()) return;
    const amt = parseFloat(transForm.amount);
    if (isNaN(amt) || amt <= 0) return;
    const orig = editingTrans;
    const origAcc = accounts.find((a) => a.id === orig.accountId);
    const newAcc = accounts.find((a) => a.id === transForm.accountId);
    await sb.from("transfers").update({
      amount: amt,
      account_id: transForm.accountId || null,
      counterparty: transForm.counterparty.trim(),
      date: transForm.date,
      notes: transForm.notes || null,
    }).eq("id", orig.id);
    const isRec = orig.type === "received";
    if (origAcc?.id === newAcc?.id) {
      // Same account: undo old + apply new in one step to avoid stale-state overwrite
      if (origAcc)
        await sb.from("accounts").update({
          balance: origAcc.balance - transDelta(origAcc, isRec, orig.amount) + transDelta(origAcc, isRec, amt),
        }).eq("id", origAcc.id);
    } else {
      if (origAcc)
        await sb.from("accounts").update({ balance: origAcc.balance - transDelta(origAcc, isRec, orig.amount) }).eq("id", origAcc.id);
      if (newAcc)
        await sb.from("accounts").update({ balance: newAcc.balance + transDelta(newAcc, isRec, amt) }).eq("id", newAcc.id);
    }
    setEditingTrans(null);
    if (reloadAll) await reloadAll();
  };
  const deleteTrans = async (t) => {
    if (!window.confirm("¿Eliminar esta transferencia?")) return;
    await sb.from("transfers").delete().eq("id", t.id);
    const acc = accounts.find((a) => a.id === t.accountId);
    if (acc)
      await sb.from("accounts").update({ balance: acc.balance - transDelta(acc, t.type === "received", t.amount) }).eq("id", acc.id);
    if (reloadAll) await reloadAll();
  };
  const saveCat = async () => {
    if (!catForm.name.trim()) return;
    const budget = parseFloat(catForm.budget) || 0;
    if (editingCat) {
      await sb
        .from("categories")
        .update({
          name: catForm.name.trim(),
          budget,
          icon: catForm.icon,
          color: catForm.color,
        })
        .eq("id", editingCat.id);
    } else {
      await sb
        .from("categories")
        .insert({
          user_id: session?.user?.id,
          name: catForm.name.trim(),
          budget,
          icon: catForm.icon,
          color: catForm.color,
        });
    }
    setEditingCat(null);
    setShowAddCat(false);
    if (reloadAll) await reloadAll();
  };

  const ColorPicker = ({ value, onChange, cols }) => (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
      {(cols || CAT_COLORS).map((col) => (
        <button
          key={col}
          onClick={() => onChange(col)}
          style={{
            width: 32,
            height: 32,
            borderRadius: 16,
            background: col,
            border: "none",
            cursor: "pointer",
            outline: value === col ? "3px solid #fff" : "none",
            outlineOffset: 2,
          }}
        />
      ))}
    </div>
  );
  const IconPicker = ({ value, onChange, color, icons }) => (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {(icons || CAT_ICONS).map((ic) => (
        <button
          key={ic}
          onClick={() => onChange(ic)}
          style={{
            width: 38,
            height: 38,
            borderRadius: 9,
            border: "none",
            background: value === ic ? color + "44" : C.elevated,
            fontSize: 18,
            cursor: "pointer",
            outline:
              value === ic ? `2px solid ${color}` : `1px solid ${C.border}`,
          }}
        >
          {ic}
        </button>
      ))}
    </div>
  );

  return (
    <div style={{ padding: "0 16px 20px", maxWidth: 480, margin: "0 auto" }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: 18,
          paddingTop: 20,
        }}
      >
        <div>
          <div
            style={{
              fontSize: 26,
              fontWeight: 900,
              color: C.text,
              letterSpacing: -0.5,
            }}
          >
            Finance Tracker
          </div>
          <div style={{ fontSize: 13, color: C.sub, marginTop: 2 }}>
            {new Date().toLocaleDateString("es-MX", {
              weekday: "long",
              day: "numeric",
              month: "long",
            })}
          </div>
        </div>
      </div>

      {/* CUENTAS */}
      <SectionHead
        label="🏦 Cuentas"
        isOpen={openSections.accounts}
        onToggle={() => toggle("accounts")}
        count={accounts.length}
        color={C.accent}
        onAdd={() => setShowAddAcc(true)}
        addLabel="Agregar"
      />
      <SectionBody isOpen={openSections.accounts} color={C.accent}>
        <div
          style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}
        >
          {accounts.map((acc) => (
            <AccountCard
              key={acc.id}
              acc={acc}
              onClick={() => setEditingAcc(acc)}
            />
          ))}
        </div>
      </SectionBody>

      {/* TRANSFERENCIAS */}
      {(() => {
        const visTransfers = transfers.filter(
          (t) => !t.counterparty?.startsWith("__goal__"),
        );
        return (
          <>
            <SectionHead
              label="↕️ Transferencias"
              isOpen={openSections.transfers}
              onToggle={() => toggle("transfers")}
              count={visTransfers.length}
              color={C.green}
              onAdd={() => {
                setTransForm(emptyTransForm);
                setShowAddTrans(true);
              }}
              addLabel="Registrar"
            />
            <SectionBody isOpen={openSections.transfers} color={C.green}>
              {visTransfers.length === 0 ? (
                <div style={{ textAlign: "center", padding: "10px 0", color: C.muted, fontSize: 12 }}>
                  Sin transferencias registradas
                </div>
              ) : (
                visTransfers.slice(0, 8).map((t) => {
                  const acc = accounts.find((a) => a.id === t.accountId);
                  const isSent = t.type === "sent";
                  return (
                    <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 9, padding: "8px 0", borderBottom: `1px solid ${C.border}` }}>
                      <span style={{ fontSize: 18 }}>{isSent ? "📤" : "📥"}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>
                          {isSent ? "A: " : "De: "}
                          <span style={{ color: isSent ? C.red : C.green }}>{t.counterparty}</span>
                        </div>
                        <div style={{ display: "flex", gap: 5, marginTop: 2 }}>
                          {acc && <Tag color={acc.color}>{acc.name}</Tag>}
                          <span style={{ fontSize: 10, color: C.muted }}>{fmtDateShort(t.date)}</span>
                        </div>
                      </div>
                      <span style={{ fontSize: 13, fontWeight: 900, color: isSent ? C.red : C.green }}>{isSent ? "−" : "+"}{mxn(t.amount)}</span>
                      <button onClick={() => { setTransForm({ type: t.type, amount: String(t.amount), accountId: t.accountId, counterparty: t.counterparty, date: t.date, notes: t.notes || "" }); setEditingTrans(t); }} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, color: C.sub, padding: "2px 4px" }}>✏️</button>
                      <button onClick={() => deleteTrans(t)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, color: C.red, padding: "2px 4px" }}>🗑</button>
                    </div>
                  );
                })
              )}
            </SectionBody>
          </>
        );
      })()}

      {/* RETIROS DE METAS */}
      {(() => {
        const gwSorted = [...(goalWithdrawals || [])].sort((a, b) =>
          b.date.localeCompare(a.date),
        );
        return (
          <>
            <SectionHead
              label="💸 Retiros de Metas"
              isOpen={openSections.withdrawals}
              onToggle={() => toggle("withdrawals")}
              count={gwSorted.length}
              color={C.accent}
            />
            <SectionBody isOpen={openSections.withdrawals} color={C.accent}>
              {gwSorted.length === 0 ? (
                <div style={{ textAlign: "center", padding: "10px 0", color: C.muted, fontSize: 12 }}>
                  Sin retiros de metas
                </div>
              ) : (
                gwSorted.map((w) => {
                  const acc = accounts.find((a) => a.id === w.accountId);
                  const goal = goals.find((g) => g.id === w.goalId);
                  return (
                    <div key={w.id} style={{ display: "flex", alignItems: "center", gap: 9, padding: "8px 0", borderBottom: `1px solid ${C.border}` }}>
                      <span style={{ fontSize: 18 }}>💸</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>
                          {goal?.name || "Meta"}
                          {w.concept && <span style={{ color: C.sub, fontWeight: 400 }}> · {w.concept}</span>}
                        </div>
                        <div style={{ display: "flex", gap: 5, marginTop: 2 }}>
                          {acc && <Tag color={acc.color}>{acc.name}</Tag>}
                          <span style={{ fontSize: 10, color: C.muted }}>{fmtDateShort(w.date)}</span>
                        </div>
                      </div>
                      <span style={{ fontSize: 13, fontWeight: 900, color: C.green }}>+{mxn(w.amount)}</span>
                      <button onClick={() => { setGwForm({ amount: String(w.amount), date: w.date, concept: w.concept || "", accountId: w.accountId }); setEditingGW(w); }} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, color: C.sub, padding: "2px 4px" }}>✏️</button>
                      <button onClick={() => deleteGW(w)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, color: C.red, padding: "2px 4px" }}>🗑</button>
                    </div>
                  );
                })
              )}
            </SectionBody>
          </>
        );
      })()}

      {/* CATEGORÍAS */}
      <SectionHead
        label="🏷️ Categorías"
        isOpen={openSections.cats}
        onToggle={() => toggle("cats")}
        count={categories.length}
        color="#FF9800"
        onAdd={() => {
          setCatForm(emptyCatForm);
          setEditingCat(null);
          setShowAddCat(true);
        }}
        addLabel="Nueva"
      />
      <SectionBody isOpen={openSections.cats} color="#FF9800">
        {catBreakdown.map((cat) => {
          const pct = cat.budget > 0 ? (cat.spent / cat.budget) * 100 : 0;
          const over = pct > 100;
          return (
            <div
              key={cat.id}
              style={{
                padding: "9px 0",
                borderBottom: `1px solid ${C.border}`,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 9,
                  marginBottom: 6,
                }}
              >
                <div
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 9,
                    background: cat.color + "22",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 17,
                    flexShrink: 0,
                  }}
                >
                  {cat.icon}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>
                    {cat.name}
                  </div>
                  <div
                    style={{
                      fontSize: 10,
                      color: over ? C.red : C.sub,
                      fontWeight: 600,
                    }}
                  >
                    {mxn(cat.spent)}{" "}
                    <span style={{ color: C.muted }}>
                      / {mxn(cat.budget)} presupuesto
                    </span>
                    {over && (
                      <span style={{ color: C.red, fontWeight: 800 }}>
                        {" "}
                        · +{mxn(cat.spent - cat.budget)}
                      </span>
                    )}
                  </div>
                </div>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 800,
                    color: over ? C.red : C.green,
                    flexShrink: 0,
                  }}
                >
                  {pct.toFixed(0)}%
                </span>
                <button
                  onClick={() => {
                    setEditingCat(cat);
                    setCatForm({
                      name: cat.name,
                      budget: String(cat.budget),
                      icon: cat.icon,
                      color: cat.color,
                    });
                    setShowAddCat(true);
                  }}
                  style={{
                    background: C.elevated,
                    border: `1px solid ${C.border}`,
                    borderRadius: 7,
                    padding: "4px 7px",
                    color: C.sub,
                    fontSize: 12,
                    cursor: "pointer",
                    flexShrink: 0,
                  }}
                >
                  ✏️
                </button>
              </div>
              <ProgressBar pct={pct} color={over ? C.red : cat.color} h={5} />
            </div>
          );
        })}
        {categories.length === 0 && (
          <div
            style={{
              textAlign: "center",
              padding: "10px 0",
              color: C.muted,
              fontSize: 12,
            }}
          >
            Sin categorías
          </div>
        )}
      </SectionBody>

      <div style={{ height: 20 }} />

      {/* ──── MODALS ──── */}
      <AccountModal
        open={showAddAcc}
        onClose={() => setShowAddAcc(false)}
        onSave={(data) => {
          onAddAccount(data);
          setShowAddAcc(false);
        }}
      />
      <AccountModal
        open={!!editingAcc}
        onClose={() => setEditingAcc(null)}
        editAccount={editingAcc}
        onSave={(data) => {
          onUpdateAccount({ ...editingAcc, ...data });
          setEditingAcc(null);
        }}
        onDelete={() => {
          onDeleteAccount(editingAcc.id);
          setEditingAcc(null);
        }}
      />

      <Modal
        open={showAddTrans}
        onClose={() => setShowAddTrans(false)}
        title="Nueva Transferencia"
      >
        {/* Type toggle */}
        <Field label="Tipo">
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 10,
              marginBottom: 4,
            }}
          >
            {[
              ["received", "📥", "Recibí", C.green],
              ["sent", "📤", "Envié", C.red],
            ].map(([type, icon, label, col]) => {
              const active = transForm.type === type;
              return (
                <button
                  key={type}
                  onClick={() => setTransForm((f) => ({ ...f, type }))}
                  style={{
                    background: active ? col + "22" : C.card,
                    border: `1.5px solid ${active ? col : C.border}`,
                    borderRadius: 13,
                    padding: "12px 8px",
                    cursor: "pointer",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  <span style={{ fontSize: 22 }}>{icon}</span>
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 800,
                      color: active ? col : C.text,
                    }}
                  >
                    {label}
                  </span>
                </button>
              );
            })}
          </div>
        </Field>
        <Field
          label={
            transForm.type === "received"
              ? "¿De quién recibiste?"
              : "¿A quién enviaste?"
          }
        >
          <Input
            value={transForm.counterparty}
            onChange={(v) => setTransForm((f) => ({ ...f, counterparty: v }))}
            placeholder="Nombre o empresa..."
          />
        </Field>
        <Field label="Monto (MXN)">
          <Input
            value={transForm.amount}
            onChange={(v) => setTransForm((f) => ({ ...f, amount: v }))}
            placeholder="$0.00"
            type="number"
          />
        </Field>
        <Field
          label={transForm.type === "received" ? "Depositar en" : "Retirar de"}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            {accounts.map((acc) => {
              const sel = transForm.accountId === acc.id;
              const isRec = transForm.type === "received";
              const newBal =
                transForm.amount && !isNaN(parseFloat(transForm.amount)) && sel
                  ? acc.balance +
                    (isRec
                      ? parseFloat(transForm.amount)
                      : -parseFloat(transForm.amount))
                  : null;
              return (
                <button
                  key={acc.id}
                  onClick={() =>
                    setTransForm((f) => ({ ...f, accountId: acc.id }))
                  }
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    background: sel ? acc.color + "22" : C.card,
                    border: `1.5px solid ${sel ? acc.color : C.border}`,
                    borderRadius: 11,
                    padding: "9px 12px",
                    cursor: "pointer",
                  }}
                >
                  <span style={{ fontSize: 18 }}>
                    {acc.type === "debit" ? "🏦" : "💳"}
                  </span>
                  <div style={{ flex: 1, textAlign: "left" }}>
                    <div
                      style={{ fontSize: 12, fontWeight: 800, color: C.text }}
                    >
                      {acc.name}
                    </div>
                    <div style={{ fontSize: 10, color: C.sub }}>
                      {mxn(acc.balance)}
                      {newBal !== null && (
                        <span style={{ color: isRec ? C.green : C.red }}>
                          {" "}
                          → {mxn(newBal)}
                        </span>
                      )}
                    </div>
                  </div>
                  {sel && <span style={{ color: acc.color }}>✓</span>}
                </button>
              );
            })}
          </div>
        </Field>
        <Field label="Fecha">
          <Input
            value={transForm.date}
            onChange={(v) => setTransForm((f) => ({ ...f, date: v }))}
            type="date"
          />
        </Field>
        <Field label="Notas (opcional)">
          <Input
            value={transForm.notes}
            onChange={(v) => setTransForm((f) => ({ ...f, notes: v }))}
            placeholder="Ej. Pago de renta..."
          />
        </Field>
        <SaveBtn
          onClick={saveTrans}
          color={transForm.type === "received" ? C.green : C.red}
        >
          {transForm.type === "received"
            ? "Registrar Recibida"
            : "Registrar Enviada"}
        </SaveBtn>
      </Modal>

      {/* Edit Transfer Modal */}
      {/* Edit Goal Withdrawal */}
      <Modal open={!!editingGW} onClose={() => setEditingGW(null)} title={`✏️ Editar Retiro · ${goals.find((g) => g.id === editingGW?.goalId)?.name || "Meta"}`}>
        <Field label="Monto (MXN)">
          <Input value={gwForm.amount} onChange={(v) => setGwForm((f) => ({ ...f, amount: v }))} placeholder="$0.00" type="number" />
        </Field>
        <Field label="Depositar en">
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            {accounts.map((acc) => {
              const sel = gwForm.accountId === acc.id;
              return (
                <button key={acc.id} onClick={() => setGwForm((f) => ({ ...f, accountId: acc.id }))}
                  style={{ display: "flex", alignItems: "center", gap: 10, background: sel ? acc.color + "22" : C.card, border: `1.5px solid ${sel ? acc.color : C.border}`, borderRadius: 11, padding: "9px 12px", cursor: "pointer" }}>
                  <span style={{ fontSize: 18 }}>{acc.type === "debit" ? "🏦" : "💳"}</span>
                  <div style={{ flex: 1, textAlign: "left" }}>
                    <div style={{ fontSize: 12, fontWeight: 800, color: C.text }}>{acc.name}</div>
                    <div style={{ fontSize: 10, color: C.sub }}>{mxn(acc.balance)}</div>
                  </div>
                  {sel && <span style={{ color: acc.color }}>✓</span>}
                </button>
              );
            })}
          </div>
        </Field>
        <Field label="Fecha">
          <Input value={gwForm.date} onChange={(v) => setGwForm((f) => ({ ...f, date: v }))} type="date" />
        </Field>
        <Field label="Concepto (opcional)">
          <Input value={gwForm.concept} onChange={(v) => setGwForm((f) => ({ ...f, concept: v }))} placeholder="Ej. Pago inicial..." />
        </Field>
        <SaveBtn onClick={updateGW} color={C.green}>Guardar Cambios</SaveBtn>
      </Modal>

      <Modal open={!!editingTrans} onClose={() => setEditingTrans(null)} title="Editar Transferencia">
        <Field label={transForm.type === "received" ? "¿De quién recibiste?" : "¿A quién enviaste?"}>
          <Input value={transForm.counterparty} onChange={(v) => setTransForm((f) => ({ ...f, counterparty: v }))} placeholder="Nombre o empresa..." />
        </Field>
        <Field label="Monto (MXN)">
          <Input value={transForm.amount} onChange={(v) => setTransForm((f) => ({ ...f, amount: v }))} placeholder="$0.00" type="number" />
        </Field>
        <Field label={transForm.type === "received" ? "Depositar en" : "Retirar de"}>
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            {accounts.map((acc) => {
              const sel = transForm.accountId === acc.id;
              const isRec = transForm.type === "received";
              const newBal = transForm.amount && !isNaN(parseFloat(transForm.amount)) && sel
                ? acc.balance + (isRec ? parseFloat(transForm.amount) : -parseFloat(transForm.amount))
                : null;
              return (
                <button key={acc.id} onClick={() => setTransForm((f) => ({ ...f, accountId: acc.id }))}
                  style={{ display: "flex", alignItems: "center", gap: 10, background: sel ? acc.color + "22" : C.card, border: `1.5px solid ${sel ? acc.color : C.border}`, borderRadius: 11, padding: "9px 12px", cursor: "pointer" }}>
                  <span style={{ fontSize: 18 }}>{acc.type === "debit" ? "🏦" : "💳"}</span>
                  <div style={{ flex: 1, textAlign: "left" }}>
                    <div style={{ fontSize: 12, fontWeight: 800, color: C.text }}>{acc.name}</div>
                    <div style={{ fontSize: 10, color: C.sub }}>
                      {mxn(acc.balance)}
                      {newBal !== null && <span style={{ color: isRec ? C.green : C.red }}> → {mxn(newBal)}</span>}
                    </div>
                  </div>
                  {sel && <span style={{ color: acc.color }}>✓</span>}
                </button>
              );
            })}
          </div>
        </Field>
        <Field label="Fecha">
          <Input value={transForm.date} onChange={(v) => setTransForm((f) => ({ ...f, date: v }))} type="date" />
        </Field>
        <Field label="Notas (opcional)">
          <Input value={transForm.notes} onChange={(v) => setTransForm((f) => ({ ...f, notes: v }))} placeholder="Ej. Pago de renta..." />
        </Field>
        <SaveBtn onClick={updateTrans} color={C.accent}>Guardar Cambios</SaveBtn>
      </Modal>

      <Modal
        open={showAddCat}
        onClose={() => {
          setShowAddCat(false);
          setEditingCat(null);
        }}
        title={editingCat ? "Editar Categoría" : "Nueva Categoría"}
      >
        <Field label="Nombre">
          <Input
            value={catForm.name}
            onChange={(v) => setCatForm((f) => ({ ...f, name: v }))}
            placeholder="Ej. Transporte..."
          />
        </Field>
        <Field label="Presupuesto mensual (MXN)">
          <Input
            value={catForm.budget}
            onChange={(v) => setCatForm((f) => ({ ...f, budget: v }))}
            placeholder="0.00"
            type="number"
          />
        </Field>
        <Field label="Ícono">
          <IconPicker
            value={catForm.icon}
            onChange={(v) => setCatForm((f) => ({ ...f, icon: v }))}
            color={catForm.color}
            icons={CAT_ICONS}
          />
        </Field>
        <Field label="Color">
          <ColorPicker
            value={catForm.color}
            onChange={(v) => setCatForm((f) => ({ ...f, color: v }))}
            cols={CAT_COLORS}
          />
        </Field>
        <div
          style={{
            background: C.elevated,
            borderRadius: 11,
            padding: "9px 12px",
            marginBottom: 12,
            border: `1px solid ${C.border}`,
            borderLeft: `3px solid ${catForm.color}`,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span style={{ fontSize: 18 }}>{catForm.icon}</span>
          <div>
            <div style={{ fontSize: 13, fontWeight: 800, color: C.text }}>
              {catForm.name || "Categoría"}
            </div>
            <div
              style={{ fontSize: 11, color: catForm.color, fontWeight: 700 }}
            >
              {catForm.budget ? mxn(parseFloat(catForm.budget) || 0) : mxn(0)}
              /mes
            </div>
          </div>
        </div>
        {editingCat && (
          <button
            onClick={async () => {
              await sb.from("categories").delete().eq("id", editingCat.id);
              setShowAddCat(false);
              setEditingCat(null);
              if (reloadAll) await reloadAll();
            }}
            style={{
              width: "100%",
              background: C.redDim,
              border: `1px solid ${C.red}44`,
              borderRadius: 12,
              padding: "10px 0",
              color: C.red,
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
              marginBottom: 8,
            }}
          >
            🗑 Eliminar
          </button>
        )}
        <SaveBtn onClick={saveCat} color={catForm.color}>
          {editingCat ? "Guardar Cambios" : "Crear Categoría"}
        </SaveBtn>
      </Modal>
    </div>
  );
}

// ─── EXPENSE ROW ──────────────────────────────────────────────────────────────
function ExpenseRow({ exp, accounts, categories, onClick }) {
  const acc = accounts.find((a) => a.id === exp.accountId);
  const cat = categories.find((c) => c.id === exp.categoryId);
  const pd = exp.paymentDate;
  const d = pd ? daysUntil(pd) : null;
  const isMSI = exp.isMSIInstallment;
  const isTDC = exp.isTDCPayment;
  const urgent = d !== null && d <= 5 && !isMSI && !isTDC;

  const iconEl = isTDC ? "💳" : isMSI ? "📆" : cat?.icon || "🏷️";
  const iconBg = isTDC
    ? C.green + "22"
    : isMSI
      ? C.orange + "22"
      : (cat?.color || C.accent) + "22";
  const amtColor = isTDC ? C.green : isMSI ? C.orange : C.red;
  const borderColor = isTDC
    ? C.green + "44"
    : isMSI
      ? C.orange + "44"
      : urgent
        ? C.orange + "55"
        : C.border;
  const rowBg = isTDC ? C.greenDim : isMSI ? C.elevated : C.card;

  return (
    <div
      onClick={onClick}
      style={{
        background: rowBg,
        borderRadius: 13,
        padding: "11px 13px",
        marginBottom: 7,
        display: "flex",
        alignItems: "center",
        gap: 11,
        border: `1px solid ${borderColor}`,
        cursor: "pointer",
        transition: "opacity .15s",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.opacity = ".85")}
      onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
    >
      <div
        style={{
          width: 38,
          height: 38,
          borderRadius: 10,
          background: iconBg,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 18,
          flexShrink: 0,
        }}
      >
        {iconEl}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 14,
            fontWeight: 700,
            color: C.text,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {exp.description}
        </div>
        <div
          style={{
            display: "flex",
            gap: 5,
            alignItems: "center",
            marginTop: 3,
            flexWrap: "wrap",
          }}
        >
          {isTDC && <Badge color={C.green}>Pago TDC</Badge>}
          {isMSI && (
            <Badge color={C.orange}>
              MSI {exp.msiIndex}/{exp.msiTotal}
            </Badge>
          )}
          {!isTDC && !isMSI && cat && (
            <span style={{ fontSize: 10, color: C.sub }}>{cat.name}</span>
          )}
          {acc && <Tag color={acc.color}>{acc.name}</Tag>}
          {pd && !isMSI && !isTDC && (
            <Badge color={d !== null && d <= 3 ? C.red : C.blue}>
              💳 {fmtDateShort(pd)}
            </Badge>
          )}
        </div>
      </div>
      <div
        style={{
          fontSize: 14,
          fontWeight: 800,
          color: amtColor,
          flexShrink: 0,
        }}
      >
        {isTDC ? "-" : ""}
        {mxn(exp.amount)}
      </div>
    </div>
  );
}

// ─── EXPENSES ─────────────────────────────────────────────────────────────────
function Expenses({
  expenses,
  setExpenses,
  accounts,
  setAccounts,
  subs,
  plans,
  setPlans,
  categories,
  goals,
  setGoals,
  transfers,
  goalWithdrawals,
  session,
  reloadAll,
}) {
  const [showModal, setShowModal] = useState(false);
  const [showDetail, setShowDetail] = useState(null);
  const [editDate, setEditDate] = useState(null);
  const [expenseEdit, setExpenseEdit] = useState(null);
  const [paidPayments, setPaidPayments] = useState(() => {
    try {
      return new Set(
        JSON.parse(localStorage.getItem("paidTdcPayments") || "[]"),
      );
    } catch {
      return new Set();
    }
  });
  const [msiConfirmPayment, setMsiConfirmPayment] = useState(null);
  const togglePaid = (payKey, payment) => {
    setPaidPayments((prev) => {
      const next = new Set(prev);
      const wasAlreadyPaid = prev.has(payKey);
      wasAlreadyPaid ? next.delete(payKey) : next.add(payKey);
      localStorage.setItem("paidTdcPayments", JSON.stringify([...next]));
      if (!wasAlreadyPaid && payment) {
        const msiItems = payment.items.filter((e) => e.msiPlanId);
        if (msiItems.length > 0) setMsiConfirmPayment(payment);
      }
      return next;
    });
  };
  const markMsiInstallmentsPaid = async () => {
    if (!msiConfirmPayment) return;
    const msiItems = msiConfirmPayment.items.filter((e) => e.msiPlanId);
    const planIds = [...new Set(msiItems.map((e) => e.msiPlanId))];
    await Promise.all(planIds.map(async (planId) => {
      const plan = plans.find((pl) => pl.id === planId);
      if (plan) {
        const newPaid = Math.min(plan.paidM + 1, plan.totalM);
        await sb.from("msi_plans").update({ paid_months: newPaid }).eq("id", planId);
      }
    }));
    setMsiConfirmPayment(null);
    if (reloadAll) await reloadAll();
  };
  const [nextId, setNextId] = useState(200);
  const [nextPlanId, setNextPlanId] = useState(100);
  const [showPayTDC, setShowPayTDC] = useState(false);
  const [payTDCForm, setPayTDCForm] = useState({
    accountId: accounts.find((a) => a.type === "credit")?.id || 2,
    amount: "",
  });
  const [openMonths, setOpenMonths] = useState({});
  const [openDays, setOpenDays] = useState({});
  const [openPayments, setOpenPayments] = useState({});
  const [form, setForm] = useState({
    description: "",
    amount: "",
    date: today(),
    accountId: accounts[0]?.id || 1,
    categoryId: null,
    isMSI: false,
    msiMonths: "9",
    linkedGoalId: null,
  });

  // Group ALL expenses by month → then by date within month
  const byMonth = useMemo(() => {
    const map = {};
    expenses.forEach((exp) => {
      const mk = exp.date.slice(0, 7);
      if (!map[mk]) map[mk] = [];
      map[mk].push(exp);
    });
    // Also inject a "payment due" virtual entry for each credit card payment
    // grouped by (accountId + paymentDate) — keyed into the month of the paymentDate
    const payGroups = {};
    expenses.forEach((exp) => {
      if (!exp.paymentDate) return;
      const mk = exp.paymentDate.slice(0, 7);
      const key = mk + "|" + exp.accountId + "|" + exp.paymentDate;
      if (!payGroups[key])
        payGroups[key] = {
          mk,
          accountId: exp.accountId,
          paymentDate: exp.paymentDate,
          total: 0,
          items: [],
        };
      payGroups[key].total += exp.amount;
      payGroups[key].items.push(exp);
    });
    // Add subscription charges to the month they'll be charged
    subs
      .filter((s) => s.active)
      .forEach((sub) => {
        const chargeDate = nextOccurrence(sub.chargeDay);
        const mk = chargeDate.slice(0, 7);
        if (!map[mk]) map[mk] = [];
        // Don't duplicate if already recorded as expense
      });
    // Merge payment groups into their respective months as a special entry
    Object.values(payGroups).forEach((pg) => {
      if (!map[pg.mk]) map[pg.mk] = [];
      // mark as a payment-due entry so we can render it differently
      const alreadyHas = map[pg.mk].some(
        (e) => e.__payKey === pg.paymentDate + "|" + pg.accountId,
      );
      if (!alreadyHas) {
        map[pg.mk].push({
          __isPaymentDue: true,
          __payKey: pg.paymentDate + "|" + pg.accountId,
          accountId: pg.accountId,
          paymentDate: pg.paymentDate,
          total: pg.total,
          items: pg.items,
        });
      }
    });
    return Object.entries(map).sort(([a], [b]) => b.localeCompare(a));
  }, [expenses, subs]);

  const currentMonth = getCurrentMonth();

  useEffect(() => {
    setOpenMonths({ [currentMonth]: true });
  }, []);

  const toggleMonth = (mk) =>
    setOpenMonths((prev) => ({ ...prev, [mk]: !prev[mk] }));
  const toggleDay = (mk, date) =>
    setOpenDays((prev) => ({
      ...prev,
      [mk + "_" + date]: !(prev[mk + "_" + date] ?? true),
    }));
  const togglePayments = (mk) =>
    setOpenPayments((prev) => ({ ...prev, [mk]: !(prev[mk] ?? true) }));

  const monthLabel = (mk) => {
    const [y, m] = mk.split("-");
    return new Date(+y, +m - 1, 1).toLocaleDateString("es-MX", {
      month: "long",
      year: "numeric",
    });
  };

  const selectedAcc = accounts.find((a) => a.id === form.accountId);
  const selectedCat = categories.find((c) => c.id === form.categoryId);
  const isSavingsCat = selectedCat?.name?.toLowerCase().includes("ahorro");
  const payDate =
    !form.isMSI &&
    selectedAcc?.type === "credit" &&
    selectedAcc.cutDay &&
    selectedAcc.payDay
      ? calcPaymentDate(form.date, selectedAcc.cutDay, selectedAcc.payDay)
      : null;

  const msiMonthsNum = parseInt(form.msiMonths) || 9;
  const msiTotal = parseFloat(form.amount) || 0;
  const msiMonthly =
    msiTotal > 0 && msiMonthsNum > 0
      ? Math.round((msiTotal / msiMonthsNum) * 100) / 100
      : 0;

  const save = async () => {
    if (!form.description.trim() || !form.amount) return;
    const amt = parseFloat(form.amount);
    if (isNaN(amt) || amt <= 0) return;
    const acc = accounts.find((a) => a.id === form.accountId);
    const userId = session?.user?.id;

    if (form.isMSI && acc?.type === "credit") {
      const numM = parseInt(form.msiMonths) || 9;
      const monthly = Math.round((amt / numM) * 100) / 100;
      const payDates = getMsiPaymentDates(form.date, acc, numM);

      // 1. Create MSI plan in Supabase
      const { data: planRow } = await sb
        .from("msi_plans")
        .insert({
          user_id: userId,
          description: form.description.trim(),
          total_amount: amt,
          monthly_payment: monthly,
          total_months: numM,
          paid_months: 0,
          account_id: acc.id,
          start_date: form.date,
        })
        .select()
        .single();

      if (planRow) {
        // 2. Create installment expenses in Supabase
        const rows = payDates.map((pd, i) => ({
          user_id: userId,
          description: `${form.description.trim()} (${i + 1}/${numM})`,
          amount: monthly,
          date: pd,
          account_id: acc.id,
          category_id: form.categoryId || null,
          payment_date: pd,
          is_msi: true,
          msi_plan_id: planRow.id,
          msi_index: i + 1,
          msi_total: numM,
          is_tdc_payment: false,
          is_subscription: false,
        }));
        await sb.from("expenses").insert(rows);
      }
      // 3. Update card balance (credit: adds to debt, debit: deducts from balance)
      if (acc)
        await sb
          .from("accounts")
          .update({
            balance:
              acc.type === "credit" ? acc.balance + amt : acc.balance - amt,
          })
          .eq("id", acc.id);
    } else {
      const pd =
        acc?.type === "credit" && acc.cutDay && acc.payDay
          ? calcPaymentDate(form.date, acc.cutDay, acc.payDay)
          : null;

      // Write expense to Supabase
      await sb.from("expenses").insert({
        user_id: userId,
        description: form.description.trim(),
        amount: amt,
        date: form.date,
        account_id: form.accountId || null,
        category_id: form.categoryId || null,
        payment_date: pd,
        is_msi: false,
        is_tdc_payment: false,
        is_subscription: false,
        linked_goal_id:
          isSavingsCat && form.linkedGoalId ? form.linkedGoalId : null,
      });

      // Update account balance (credit: adds to debt, debit: deducts from balance)
      if (acc)
        await sb
          .from("accounts")
          .update({
            balance:
              acc.type === "credit" ? acc.balance + amt : acc.balance - amt,
          })
          .eq("id", acc.id);

      // If savings → update goal
      if (isSavingsCat && form.linkedGoalId) {
        const goal = goals.find((g) => g.id === form.linkedGoalId);
        if (goal)
          await sb
            .from("goals")
            .update({ current_amount: goal.current + amt })
            .eq("id", goal.id);
      }
    }

    setForm((f) => ({
      ...f,
      description: "",
      amount: "",
      date: today(),
      isMSI: false,
      msiMonths: "9",
      linkedGoalId: null,
    }));
    setShowModal(false);
    if (reloadAll) await reloadAll();
  };

  const totalThisMonth = expenses
    .filter((e) => e.date.startsWith(currentMonth) && !e.isMSIInstallment)
    .reduce((s, e) => s + e.amount, 0);

  // Filter: only show current month and past — no future months
  const visibleByMonth = byMonth.filter(([mk]) => mk <= currentMonth);

  return (
    <div style={{ paddingBottom: 80 }}>
      {/* Header */}
      <div
        style={{
          padding: "20px 20px 12px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
        }}
      >
        <div>
          <div style={{ fontSize: 26, fontWeight: 900, color: C.text }}>
            Gastos
          </div>
          <div style={{ fontSize: 13, color: C.sub, marginTop: 2 }}>
            Este mes:{" "}
            <span style={{ color: C.red, fontWeight: 800 }}>
              {mxn(totalThisMonth)}
            </span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => setShowPayTDC(true)}
            style={{
              background: C.greenDim,
              border: `1px solid ${C.green}44`,
              borderRadius: 12,
              padding: "0 12px",
              height: 44,
              color: C.green,
              fontSize: 12,
              fontWeight: 800,
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            💳 Pagar TDC
          </button>
          <button
            onClick={() => setShowModal(true)}
            style={{
              background: C.accent,
              border: "none",
              borderRadius: 22,
              width: 44,
              height: 44,
              color: "#fff",
              fontSize: 22,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            +
          </button>
        </div>
      </div>

      {/* Accordion by month */}
      <div style={{ padding: "0 20px" }}>
        {visibleByMonth.length === 0 && (
          <div style={{ textAlign: "center", paddingTop: 80, color: C.muted }}>
            <div style={{ fontSize: 44, marginBottom: 12 }}>🧾</div>
            <div>Sin gastos registrados</div>
          </div>
        )}

        {visibleByMonth.map(([mk, allEntries]) => {
          const isOpen = !!openMonths[mk];
          const isCurrent = mk === currentMonth;

          // Separate real expenses from payment-due virtual entries
          const realExpenses = allEntries.filter((e) => !e.__isPaymentDue);
          const paymentsDue = allEntries.filter((e) => e.__isPaymentDue);

          const monthTotal = realExpenses.reduce((s, e) => s + e.amount, 0);
          const monthIncome = (transfers || [])
            .filter((t) => t.type === "received" && !t.counterparty?.startsWith("__goal__") && t.date.startsWith(mk))
            .reduce((s, t) => s + t.amount, 0)
            + (goalWithdrawals || [])
            .filter((w) => w.date.startsWith(mk))
            .reduce((s, w) => s + w.amount, 0);

          // Group real expenses by date
          const byDate = {};
          realExpenses.forEach((exp) => {
            if (!byDate[exp.date]) byDate[exp.date] = [];
            byDate[exp.date].push(exp);
          });
          const sortedDates = Object.keys(byDate).sort((a, b) =>
            b.localeCompare(a),
          );

          // Show ALL payments once the earliest one is due
          const earliestDueDate = paymentsDue.length > 0
            ? paymentsDue.reduce((min,p)=>p.paymentDate<min?p.paymentDate:min, paymentsDue[0].paymentDate)
            : null;
          const anyPaymentDue = earliestDueDate ? daysUntil(earliestDueDate)<=0 : false;
          const visiblePayments = anyPaymentDue ? paymentsDue : [];

          const headerCount =
            realExpenses.length + (visiblePayments.length > 0 ? 1 : 0);

          return (
            <div key={mk} style={{ marginBottom: 10 }}>
              {/* Month accordion header */}
              <button
                onClick={() => toggleMonth(mk)}
                style={{
                  width: "100%",
                  background: isCurrent ? C.accentDim : C.card,
                  border: `1px solid ${isCurrent ? C.accent + "55" : C.border}`,
                  borderRadius: isOpen ? "14px 14px 0 0" : 14,
                  padding: "13px 16px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  transition: "border-radius .2s",
                }}
              >
                <div style={{ flex: 1, textAlign: "left" }}>
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 800,
                      color: isCurrent ? C.accent : C.text,
                      textTransform: "capitalize",
                    }}
                  >
                    {isCurrent && (
                      <span
                        style={{
                          fontSize: 10,
                          background: C.accent,
                          color: "#fff",
                          padding: "1px 6px",
                          borderRadius: 4,
                          marginRight: 6,
                          fontWeight: 700,
                        }}
                      >
                        ACTUAL
                      </span>
                    )}
                    {monthLabel(mk)}
                  </div>
                  <div
                    style={{
                      display: "flex",
                      gap: 6,
                      alignItems: "center",
                      marginTop: 2,
                    }}
                  >
                    <span style={{ fontSize: 11, color: C.sub }}>
                      {realExpenses.length} gasto
                      {realExpenses.length !== 1 ? "s" : ""}
                    </span>
                    {visiblePayments.length > 0 && (
                      <span
                        style={{
                          fontSize: 9,
                          background: C.red + "22",
                          color: C.red,
                          padding: "1px 5px",
                          borderRadius: 4,
                          fontWeight: 700,
                        }}
                      >
                        💳 {visiblePayments.length} pago
                        {visiblePayments.length !== 1 ? "s" : ""} TDC
                      </span>
                    )}
                    {!anyPaymentDue && paymentsDue.length > 0 && (
                      <span
                        style={{
                          fontSize: 9,
                          background: C.blue + "22",
                          color: C.blue,
                          padding: "1px 5px",
                          borderRadius: 4,
                          fontWeight: 700,
                        }}
                      >
                        🔒 {paymentsDue.length} pendiente{paymentsDue.length !== 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                </div>
                <div style={{ textAlign: "right", marginRight: 4 }}>
                  {monthIncome > 0 && (
                    <div style={{ fontSize: 11, fontWeight: 700, color: C.green }}>
                      ↑ {mxn(monthIncome)}
                    </div>
                  )}
                  <div style={{ fontSize: 15, fontWeight: 800, color: C.red }}>
                    ↓ {mxn(monthTotal)}
                  </div>
                </div>
                <div
                  style={{
                    fontSize: 16,
                    color: C.sub,
                    transition: "transform .25s",
                    transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
                    flexShrink: 0,
                  }}
                >
                  ▾
                </div>
              </button>

              {/* Expanded content */}
              {isOpen && (
                <div
                  style={{
                    background: C.card,
                    border: `1px solid ${isCurrent ? C.accent + "33" : C.border}`,
                    borderTop: "none",
                    borderRadius: "0 0 14px 14px",
                    padding: "8px 12px 12px",
                  }}
                >
                  {/* Payment-due rows — one card per credit card */}
                  {visiblePayments.length > 0 && (
                    <div style={{ marginBottom: 4 }}>
                      <button
                        onClick={() => togglePayments(mk)}
                        style={{
                          width: "100%", background: "none", border: "none",
                          cursor: "pointer", padding: "6px 2px 4px",
                          display: "flex", alignItems: "center", gap: 6,
                          borderRadius: 6,
                        }}
                      >
                        <div style={{
                          fontSize: 10, fontWeight: 800, color: C.red,
                          textTransform: "uppercase", letterSpacing: 1, flex: 1, textAlign: "left",
                        }}>
                          💳 Pagos de Tarjeta
                        </div>
                        <div style={{
                          fontSize: 11, color: C.red,
                          transition: "transform .2s",
                          transform: (openPayments[mk] ?? false) ? "rotate(180deg)" : "rotate(0deg)",
                        }}>▾</div>
                      </button>
                      {(openPayments[mk] ?? false) && visiblePayments.map((p) => {
                        const acc = accounts.find((a) => a.id === p.accountId);
                        const d = daysUntil(p.paymentDate);
                        const overdue = d < 0;
                        const paid = paidPayments.has(p.__payKey);
                        const cardColor = acc?.color || C.accent;
                        return (
                          <div
                            key={p.__payKey}
                            style={{
                              borderRadius: 14,
                              marginBottom: 8,
                              overflow: "hidden",
                              border: `1px solid ${paid ? C.green + "55" : overdue ? C.red + "55" : C.orange + "55"}`,
                              background: paid
                                ? C.greenDim
                                : overdue
                                  ? C.redDim
                                  : C.elevated,
                            }}
                          >
                            {/* Card color bar */}
                            <div
                              style={{
                                height: 4,
                                background: paid ? C.green : cardColor,
                                opacity: paid ? 1 : 0.7,
                              }}
                            />
                            <div
                              style={{
                                padding: "11px 13px",
                                display: "flex",
                                alignItems: "center",
                                gap: 11,
                              }}
                            >
                              <div
                                style={{
                                  width: 38,
                                  height: 38,
                                  borderRadius: 10,
                                  background: cardColor + "22",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  fontSize: 20,
                                  flexShrink: 0,
                                  border: `1.5px solid ${cardColor}44`,
                                }}
                              >
                                💳
                              </div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div
                                  style={{
                                    fontSize: 13,
                                    fontWeight: 800,
                                    color: paid ? C.green : C.text,
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 5,
                                  }}
                                >
                                  <span
                                    style={{
                                      color: cardColor,
                                      fontWeight: 900,
                                    }}
                                  >
                                    {acc?.name || "TDC"}
                                  </span>
                                  <span
                                    style={{
                                      fontSize: 10,
                                      color: C.sub,
                                      fontWeight: 400,
                                    }}
                                  >
                                    · {p.items.length} cargo
                                    {p.items.length !== 1 ? "s" : ""}
                                  </span>
                                </div>
                                <div
                                  style={{
                                    fontSize: 10,
                                    fontWeight: 700,
                                    marginTop: 2,
                                    color: paid
                                      ? C.green
                                      : overdue
                                        ? C.red
                                        : C.orange,
                                  }}
                                >
                                  {paid
                                    ? "✅ Pagado"
                                    : overdue
                                      ? `⚠️ Venció hace ${Math.abs(d)} día${Math.abs(d) !== 1 ? "s" : ""}`
                                      : d === 0
                                        ? "🔴 Vence hoy"
                                        : `📅 Vence el ${fmtDateShort(p.paymentDate)}`}
                                </div>
                              </div>
                              <div
                                style={{
                                  display: "flex",
                                  flexDirection: "column",
                                  alignItems: "flex-end",
                                  gap: 6,
                                }}
                              >
                                <div
                                  style={{
                                    fontSize: 15,
                                    fontWeight: 900,
                                    color: paid
                                      ? C.green
                                      : overdue
                                        ? C.red
                                        : C.text,
                                    textDecoration: paid
                                      ? "line-through"
                                      : "none",
                                  }}
                                >
                                  {mxn(p.total)}
                                </div>
                                <button
                                  onClick={() => togglePaid(p.__payKey, p)}
                                  style={{
                                    background: paid ? C.green : "transparent",
                                    border: `2px solid ${paid ? C.green : C.border}`,
                                    borderRadius: 8,
                                    width: 32,
                                    height: 32,
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    cursor: "pointer",
                                    fontSize: 15,
                                    flexShrink: 0,
                                    transition: "all .15s",
                                  }}
                                >
                                  {paid ? (
                                    <span
                                      style={{ color: "#fff", fontWeight: 900 }}
                                    >
                                      ✓
                                    </span>
                                  ) : (
                                    <span style={{ color: C.muted }}>○</span>
                                  )}
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Real expense rows grouped by date */}
                  {sortedDates.map((date) => {
                    const dayKey = mk + "_" + date;
                    const isDayOpen =
                      openDays[dayKey] ?? date === sortedDates[0];
                    const dayTotal = byDate[date].reduce(
                      (s, e) => s + e.amount,
                      0,
                    );
                    return (
                      <div key={date}>
                        <button
                          onClick={() => toggleDay(mk, date)}
                          style={{
                            width: "100%",
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                            padding: "6px 2px 4px",
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                            borderRadius: 6,
                          }}
                        >
                          <div
                            style={{
                              fontSize: 10,
                              fontWeight: 800,
                              color: C.muted,
                              textTransform: "uppercase",
                              letterSpacing: 1,
                              flex: 1,
                              textAlign: "left",
                            }}
                          >
                            {parseDate(date).toLocaleDateString("es-MX", {
                              weekday: "short",
                              day: "numeric",
                              month: "short",
                            })}
                          </div>
                          {!isDayOpen && (
                            <div
                              style={{
                                fontSize: 10,
                                fontWeight: 700,
                                color: C.muted,
                              }}
                            >
                              {mxn(dayTotal)}
                            </div>
                          )}
                          <div
                            style={{
                              fontSize: 11,
                              color: C.muted,
                              transition: "transform .2s",
                              transform: isDayOpen
                                ? "rotate(180deg)"
                                : "rotate(0deg)",
                            }}
                          >
                            ▾
                          </div>
                        </button>
                        {isDayOpen &&
                          byDate[date].map((exp) => (
                            <ExpenseRow
                              key={exp.id}
                              exp={exp}
                              accounts={accounts}
                              categories={categories}
                              onClick={() => setShowDetail(exp)}
                            />
                          ))}
                      </div>
                    );
                  })}

                  {realExpenses.length === 0 &&
                    visiblePayments.length === 0 && (
                      <div
                        style={{
                          textAlign: "center",
                          padding: "20px 0",
                          color: C.muted,
                          fontSize: 12,
                        }}
                      >
                        Sin gastos este mes
                      </div>
                    )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Add Modal */}
      <Modal
        open={showModal}
        onClose={() => setShowModal(false)}
        title="Nuevo Gasto"
      >
        <Field label="Descripción">
          <Input
            value={form.description}
            onChange={(v) => setForm((f) => ({ ...f, description: v }))}
            placeholder="Ej. iPhone, Starbucks..."
          />
        </Field>
        <Field label="Monto Total (MXN)">
          <Input
            value={form.amount}
            onChange={(v) => setForm((f) => ({ ...f, amount: v }))}
            placeholder="0.00"
            type="number"
          />
        </Field>
        <Field label="Fecha de compra">
          <Input
            value={form.date}
            onChange={(v) => setForm((f) => ({ ...f, date: v }))}
            type="date"
          />
        </Field>
        <Field label="Cuenta">
          <ChipSelect
            options={accounts}
            value={form.accountId}
            onChange={(v) =>
              setForm((f) => ({ ...f, accountId: v, isMSI: false }))
            }
            getColor={(a) => a.color}
          />
        </Field>
        <Field label="Categoría">
          <ChipSelect
            options={categories}
            value={form.categoryId}
            onChange={(v) =>
              setForm((f) => ({
                ...f,
                categoryId: v,
                linkedGoalId: null,
                isMSI: false,
              }))
            }
            getColor={(c) => c.color}
          />
        </Field>

        {/* Savings: pick linked goal */}
        {isSavingsCat && (
          <Field label="¿A qué meta va este ahorro?" hint="Requerido">
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {goals.map((g) => {
                const pct = g.target > 0 ? (g.current / g.target) * 100 : 0;
                const sel = form.linkedGoalId === g.id;
                return (
                  <button
                    key={g.id}
                    onClick={() =>
                      setForm((f) => ({ ...f, linkedGoalId: g.id }))
                    }
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      background: sel ? g.color + "22" : C.card,
                      border: `1.5px solid ${sel ? g.color : C.border}`,
                      borderRadius: 12,
                      padding: "10px 12px",
                      cursor: "pointer",
                    }}
                  >
                    <span style={{ fontSize: 20 }}>{g.icon}</span>
                    <div style={{ flex: 1, textAlign: "left" }}>
                      <div
                        style={{ fontSize: 13, fontWeight: 800, color: C.text }}
                      >
                        {g.name}
                      </div>
                      <div style={{ fontSize: 10, color: C.sub }}>
                        {mxn(g.current)} / {mxn(g.target)} · {pct.toFixed(0)}%
                      </div>
                    </div>
                    {sel && (
                      <span style={{ fontSize: 14, color: g.color }}>✓</span>
                    )}
                  </button>
                );
              })}
              {goals.length === 0 && (
                <div
                  style={{
                    fontSize: 12,
                    color: C.muted,
                    textAlign: "center",
                    padding: "8px 0",
                  }}
                >
                  No tienes metas creadas
                </div>
              )}
            </div>
            {form.linkedGoalId &&
              form.amount &&
              !isNaN(parseFloat(form.amount)) &&
              (() => {
                const g = goals.find((x) => x.id === form.linkedGoalId);
                const amt = parseFloat(form.amount);
                const nomina = accounts.find((a) => a.type === "debit");
                if (!g) return null;
                return (
                  <div
                    style={{
                      background: C.greenDim,
                      borderRadius: 10,
                      padding: "9px 12px",
                      marginTop: 8,
                      border: `1px solid ${C.green}44`,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 10,
                        color: C.green,
                        fontWeight: 700,
                        marginBottom: 4,
                      }}
                    >
                      ✓ EFECTO DEL AHORRO
                    </div>
                    <div style={{ fontSize: 12, color: C.sub }}>
                      {g.icon} {g.name}:{" "}
                      <span style={{ color: C.green, fontWeight: 800 }}>
                        {mxn(g.current)} → {mxn(g.current + amt)}
                      </span>
                    </div>
                    {nomina && (
                      <div style={{ fontSize: 12, color: C.sub, marginTop: 3 }}>
                        🏦 {nomina.name}:{" "}
                        <span style={{ color: C.red, fontWeight: 800 }}>
                          {mxn(nomina.balance)} → {mxn(nomina.balance - amt)}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })()}
          </Field>
        )}

        {/* MSI toggle — only for credit accounts, and not savings */}
        {selectedAcc?.type === "credit" && !isSavingsCat && (
          <div style={{ marginBottom: 14 }}>
            <button
              onClick={() => setForm((f) => ({ ...f, isMSI: !f.isMSI }))}
              style={{
                width: "100%",
                background: form.isMSI ? C.orange + "22" : C.card,
                border: `1.5px solid ${form.isMSI ? C.orange : C.border}`,
                borderRadius: 12,
                padding: "11px 14px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                cursor: "pointer",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 18 }}>📆</span>
                <div style={{ textAlign: "left" }}>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 800,
                      color: form.isMSI ? C.orange : C.text,
                    }}
                  >
                    Compra a meses sin intereses
                  </div>
                  <div style={{ fontSize: 10, color: C.sub }}>
                    Divide el pago en mensualidades
                  </div>
                </div>
              </div>
              <div
                style={{
                  width: 28,
                  height: 16,
                  borderRadius: 8,
                  background: form.isMSI ? C.orange : C.border,
                  position: "relative",
                  transition: "background .2s",
                  flexShrink: 0,
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    top: 2,
                    left: form.isMSI ? 12 : 2,
                    width: 12,
                    height: 12,
                    borderRadius: 6,
                    background: "#fff",
                    transition: "left .2s",
                  }}
                />
              </div>
            </button>
          </div>
        )}

        {/* MSI months selector */}
        {form.isMSI && selectedAcc?.type === "credit" && (
          <>
            <Field label="Número de meses sin intereses">
              <ChipSelect
                options={["3", "6", "9", "12", "18", "24"]}
                value={form.msiMonths}
                onChange={(v) => setForm((f) => ({ ...f, msiMonths: v }))}
              />
            </Field>

            {/* Live MSI breakdown preview */}
            {msiTotal > 0 &&
              msiMonthsNum > 0 &&
              selectedAcc.cutDay &&
              selectedAcc.payDay &&
              (() => {
                const dates = getMsiPaymentDates(
                  form.date,
                  selectedAcc,
                  msiMonthsNum,
                );
                return (
                  <div
                    style={{
                      background: C.orange + "11",
                      borderRadius: 14,
                      padding: "12px 14px",
                      marginBottom: 14,
                      border: `1.5px solid ${C.orange}44`,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: 10,
                      }}
                    >
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 800,
                          color: C.orange,
                          textTransform: "uppercase",
                          letterSpacing: 0.5,
                        }}
                      >
                        📆 Plan MSI
                      </span>
                      <span
                        style={{ fontSize: 12, fontWeight: 800, color: C.text }}
                      >
                        {mxn(msiTotal)} ÷ {msiMonthsNum}
                      </span>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        background: C.elevated,
                        borderRadius: 10,
                        padding: "10px 14px",
                        marginBottom: 10,
                      }}
                    >
                      <div style={{ textAlign: "center" }}>
                        <div
                          style={{
                            fontSize: 20,
                            fontWeight: 900,
                            color: C.orange,
                          }}
                        >
                          {mxn(msiMonthly)}
                        </div>
                        <div style={{ fontSize: 10, color: C.sub }}>
                          por mes
                        </div>
                      </div>
                      <div style={{ textAlign: "center" }}>
                        <div
                          style={{
                            fontSize: 20,
                            fontWeight: 900,
                            color: C.text,
                          }}
                        >
                          {msiMonthsNum}
                        </div>
                        <div style={{ fontSize: 10, color: C.sub }}>meses</div>
                      </div>
                      <div style={{ textAlign: "center" }}>
                        <div
                          style={{
                            fontSize: 20,
                            fontWeight: 900,
                            color: C.text,
                          }}
                        >
                          {mxn(msiTotal)}
                        </div>
                        <div style={{ fontSize: 10, color: C.sub }}>total</div>
                      </div>
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        color: C.sub,
                        marginBottom: 6,
                      }}
                    >
                      Calendario de pagos:
                    </div>
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 4,
                        maxHeight: 140,
                        overflowY: "auto",
                      }}
                    >
                      {dates.map((d, i) => (
                        <div
                          key={i}
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            background: C.card,
                            borderRadius: 8,
                            padding: "5px 10px",
                          }}
                        >
                          <span style={{ fontSize: 11, color: C.sub }}>
                            Pago {i + 1}/{msiMonthsNum}
                          </span>
                          <span
                            style={{
                              fontSize: 11,
                              fontWeight: 700,
                              color: C.text,
                            }}
                          >
                            {fmtDate(d)}
                          </span>
                          <span
                            style={{
                              fontSize: 11,
                              fontWeight: 800,
                              color: C.orange,
                            }}
                          >
                            {mxn(msiMonthly)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
          </>
        )}

        {/* Normal payment date preview (only when NOT MSI) */}
        {!form.isMSI && payDate && (
          <div
            style={{
              background: C.accentDim,
              borderRadius: 12,
              padding: "10px 14px",
              marginBottom: 14,
              border: `1px solid ${C.accent}44`,
            }}
          >
            <div
              style={{
                fontSize: 11,
                color: C.accent,
                fontWeight: 700,
                marginBottom: 3,
              }}
            >
              📅 FECHA DE PAGO ESTIMADA
            </div>
            <div style={{ fontSize: 16, fontWeight: 900, color: C.text }}>
              {fmtDate(payDate)}
            </div>
            <div style={{ fontSize: 11, color: C.sub, marginTop: 2 }}>
              Ciclo que corta el día <b>{selectedAcc?.cutDay}</b> · vence día{" "}
              <b>{selectedAcc?.payDay}</b>
            </div>
          </div>
        )}

        <SaveBtn onClick={save} color={form.isMSI ? C.orange : C.accent}>
          {form.isMSI
            ? `Registrar MSI · ${msiMonthsNum} pagos de ${mxn(msiMonthly)}`
            : "Registrar Gasto"}
        </SaveBtn>
      </Modal>

      {/* Detail Modal */}
      {showDetail &&
        (() => {
          const exp = showDetail;
          const acc = accounts.find((a) => a.id === exp.accountId);
          const cat = categories.find((c) => c.id === exp.categoryId);
          const pd = exp.paymentDate;
          const d = pd ? daysUntil(pd) : null;

          const saveEdit = async () => {
            const newAmt = parseFloat(expenseEdit.amount);
            if (isNaN(newAmt) || newAmt <= 0) return;
            const oldAcc = accounts.find((a) => a.id === exp.accountId);
            const newAcc = accounts.find((a) => a.id === expenseEdit.accountId);
            await sb
              .from("expenses")
              .update({
                description: expenseEdit.description.trim(),
                amount: newAmt,
                date: expenseEdit.date,
                category_id: expenseEdit.categoryId || null,
                account_id: expenseEdit.accountId || null,
              })
              .eq("id", exp.id);
            if (oldAcc?.id === newAcc?.id) {
              if (oldAcc) {
                const oldImpact =
                  oldAcc.type === "credit" ? exp.amount : -exp.amount;
                const newImpact = oldAcc.type === "credit" ? newAmt : -newAmt;
                await sb
                  .from("accounts")
                  .update({ balance: oldAcc.balance - oldImpact + newImpact })
                  .eq("id", oldAcc.id);
              }
            } else {
              if (oldAcc)
                await sb
                  .from("accounts")
                  .update({
                    balance:
                      oldAcc.type === "credit"
                        ? oldAcc.balance - exp.amount
                        : oldAcc.balance + exp.amount,
                  })
                  .eq("id", oldAcc.id);
              if (newAcc)
                await sb
                  .from("accounts")
                  .update({
                    balance:
                      newAcc.type === "credit"
                        ? newAcc.balance + newAmt
                        : newAcc.balance - newAmt,
                  })
                  .eq("id", newAcc.id);
            }
            setExpenseEdit(null);
            setShowDetail(null);
            setEditDate(null);
            if (reloadAll) await reloadAll();
          };

          return (
            <Modal
              open={true}
              onClose={() => {
                setShowDetail(null);
                setEditDate(null);
                setExpenseEdit(null);
              }}
              title={expenseEdit ? "Editar Gasto" : "Detalle del Gasto"}
            >
              {expenseEdit ? (
                <>
                  <Field label="Descripción">
                    <Input
                      value={expenseEdit.description}
                      onChange={(v) =>
                        setExpenseEdit((f) => ({ ...f, description: v }))
                      }
                      placeholder="Descripción..."
                    />
                  </Field>
                  <Field label="Monto (MXN)">
                    <Input
                      value={expenseEdit.amount}
                      onChange={(v) =>
                        setExpenseEdit((f) => ({ ...f, amount: v }))
                      }
                      type="number"
                      placeholder="0.00"
                    />
                  </Field>
                  <Field label="Fecha">
                    <Input
                      value={expenseEdit.date}
                      onChange={(v) =>
                        setExpenseEdit((f) => ({ ...f, date: v }))
                      }
                      type="date"
                    />
                  </Field>
                  <Field label="Categoría">
                    <ChipSelect
                      options={categories}
                      value={expenseEdit.categoryId}
                      onChange={(v) =>
                        setExpenseEdit((f) => ({ ...f, categoryId: v }))
                      }
                      getColor={(c) => c.color}
                    />
                  </Field>
                  {!exp.isMSI && (
                    <Field label="Cuenta">
                      <ChipSelect
                        options={accounts}
                        value={expenseEdit.accountId}
                        onChange={(v) =>
                          setExpenseEdit((f) => ({ ...f, accountId: v }))
                        }
                        getColor={(a) => a.color}
                      />
                    </Field>
                  )}
                  <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                    <button
                      onClick={() => setExpenseEdit(null)}
                      style={{
                        flex: 1,
                        background: C.elevated,
                        border: `1px solid ${C.border}`,
                        borderRadius: 12,
                        padding: "11px 0",
                        color: C.sub,
                        fontSize: 13,
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={saveEdit}
                      style={{
                        flex: 2,
                        background: C.accent,
                        border: "none",
                        borderRadius: 12,
                        padding: "11px 0",
                        color: "#fff",
                        fontSize: 13,
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      Guardar Cambios
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 14,
                      marginBottom: 20,
                    }}
                  >
                    <div
                      style={{
                        width: 52,
                        height: 52,
                        borderRadius: 14,
                        background: (cat?.color || C.accent) + "22",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 26,
                      }}
                    >
                      {cat?.icon || "🏷️"}
                    </div>
                    <div>
                      <div
                        style={{ fontSize: 18, fontWeight: 800, color: C.text }}
                      >
                        {exp.description}
                      </div>
                      <div style={{ fontSize: 13, color: C.sub }}>
                        {fmtDate(exp.date)}
                      </div>
                    </div>
                  </div>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: 10,
                      marginBottom: 16,
                    }}
                  >
                    {[
                      { label: "Monto", val: mxn(exp.amount), color: C.red },
                      {
                        label: "Cuenta",
                        val: acc?.name || "—",
                        color: acc?.color || C.sub,
                      },
                      {
                        label: "Categoría",
                        val: cat?.name || "—",
                        color: cat?.color || C.sub,
                      },
                      pd
                        ? {
                            label: "Fecha de Pago",
                            val: fmtDate(pd),
                            color: d !== null && d <= 5 ? C.red : C.blue,
                          }
                        : {
                            label: "Tipo",
                            val: acc?.type === "credit" ? "Crédito" : "Débito",
                            color: acc?.type === "credit" ? C.accent : C.green,
                          },
                    ].map((s, i) => (
                      <div
                        key={i}
                        style={{
                          background: C.elevated,
                          borderRadius: 12,
                          padding: "10px 12px",
                          border: `1px solid ${C.border}`,
                        }}
                      >
                        <div
                          style={{
                            fontSize: 10,
                            color: C.muted,
                            marginBottom: 4,
                            textTransform: "uppercase",
                            letterSpacing: 0.5,
                          }}
                        >
                          {s.label}
                        </div>
                        <div
                          style={{
                            fontSize: 14,
                            fontWeight: 800,
                            color: s.color,
                          }}
                        >
                          {s.val}
                        </div>
                      </div>
                    ))}
                  </div>
                  {pd && (
                    <div
                      style={{
                        background:
                          d !== null && d <= 5 ? C.redDim : C.accentDim,
                        borderRadius: 12,
                        padding: "12px 14px",
                        marginBottom: 12,
                        border: `1px solid ${d !== null && d <= 5 ? C.red : C.accent}44`,
                      }}
                    >
                      <div
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          color: d !== null && d <= 5 ? C.red : C.accent,
                          marginBottom: 4,
                        }}
                      >
                        {d !== null && d <= 0
                          ? "⚠️ PAGO VENCIDO"
                          : d !== null && d <= 5
                            ? "🔴 PAGO PRÓXIMO"
                            : "📅 FECHA DE PAGO"}
                      </div>
                      <div
                        style={{ fontSize: 17, fontWeight: 900, color: C.text }}
                      >
                        {fmtDate(pd)}
                      </div>
                      <div style={{ fontSize: 12, color: C.sub, marginTop: 3 }}>
                        {d !== null && d < 0
                          ? `Venció hace ${Math.abs(d)} días`
                          : d === 0
                            ? "Vence hoy"
                            : `Faltan ${d} días para pagar`}
                      </div>
                    </div>
                  )}
                  <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                    <button
                      onClick={() =>
                        setExpenseEdit({
                          description: exp.description,
                          amount: String(exp.amount),
                          date: exp.date,
                          categoryId: exp.categoryId,
                          accountId: exp.accountId,
                        })
                      }
                      style={{
                        flex: 1,
                        background: C.elevated,
                        border: `1px solid ${C.border}`,
                        borderRadius: 12,
                        padding: "11px 0",
                        color: C.text,
                        fontSize: 13,
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      ✏️ Editar
                    </button>
                    <button
                      onClick={async () => {
                        if (!window.confirm("¿Eliminar este gasto?")) return;
                        await sb.from("expenses").delete().eq("id", exp.id);
                        const a = accounts.find((x) => x.id === exp.accountId);
                        if (a)
                          await sb
                            .from("accounts")
                            .update({
                              balance:
                                a.type === "credit"
                                  ? a.balance - exp.amount
                                  : a.balance + exp.amount,
                            })
                            .eq("id", a.id);
                        setShowDetail(null);
                        setEditDate(null);
                        setExpenseEdit(null);
                        if (reloadAll) await reloadAll();
                      }}
                      style={{
                        flex: 1,
                        background: C.redDim,
                        border: `1px solid ${C.red}44`,
                        borderRadius: 12,
                        padding: "11px 0",
                        color: C.red,
                        fontSize: 13,
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      🗑 Eliminar
                    </button>
                  </div>
                </>
              )}
            </Modal>
          );
        })()}

      {/* MSI installment confirmation when marking a TDC payment as paid */}
      <Modal open={!!msiConfirmPayment} onClose={() => setMsiConfirmPayment(null)} title="📦 Cuotas MSI incluidas">
        <div style={{ fontSize: 13, color: C.sub, marginBottom: 14 }}>
          Este pago incluye las siguientes cuotas MSI. ¿Quieres marcarlas como pagadas y avanzar la barra de progreso?
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 18 }}>
          {(msiConfirmPayment?.items.filter((e) => e.msiPlanId) || []).map((e) => {
            const plan = plans.find((pl) => pl.id === e.msiPlanId);
            return (
              <div key={e.id} style={{ background: C.elevated, borderRadius: 10, padding: "9px 12px", border: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 800, color: C.text }}>{e.description}</div>
                  {plan && <div style={{ fontSize: 10, color: C.sub, marginTop: 2 }}>Pagado {plan.paidM}/{plan.totalM} cuotas</div>}
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.orange }}>{mxn(e.amount)}</div>
              </div>
            );
          })}
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={() => setMsiConfirmPayment(null)} style={{ flex: 1, background: C.elevated, border: `1px solid ${C.border}`, borderRadius: 12, padding: "11px 0", color: C.sub, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
            No, solo marcar pagado
          </button>
          <button onClick={markMsiInstallmentsPaid} style={{ flex: 1, background: C.orange + "22", border: `1px solid ${C.orange}55`, borderRadius: 12, padding: "11px 0", color: C.orange, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
            Sí, actualizar MSI
          </button>
        </div>
      </Modal>

      {/* PAY TDC MODAL */}
      <Modal
        open={showPayTDC}
        onClose={() => setShowPayTDC(false)}
        title="💳 Pagar Tarjeta de Crédito"
      >
        <div style={{ fontSize: 12, color: C.sub, marginBottom: 16 }}>
          El pago se descuenta de tu cuenta{" "}
          <b style={{ color: "#4CAF50" }}>Nómina</b> y reduce la deuda de la
          tarjeta.
        </div>
        <Field label="Tarjeta a pagar">
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {accounts
              .filter((a) => a.type === "credit")
              .map((acc) => {
                const selected = payTDCForm.accountId === acc.id;
                return (
                  <button
                    key={acc.id}
                    onClick={() =>
                      setPayTDCForm((f) => ({ ...f, accountId: acc.id }))
                    }
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      background: selected ? acc.color + "22" : C.card,
                      border: `1.5px solid ${selected ? acc.color : C.border}`,
                      borderRadius: 12,
                      padding: "11px 14px",
                      cursor: "pointer",
                    }}
                  >
                    <span style={{ fontSize: 20 }}>💳</span>
                    <div style={{ flex: 1, textAlign: "left" }}>
                      <div
                        style={{ fontSize: 13, fontWeight: 800, color: C.text }}
                      >
                        {acc.name}
                      </div>
                      <div style={{ fontSize: 11, color: C.red }}>
                        Deuda: {mxn(Math.abs(acc.balance))}
                      </div>
                    </div>
                    {selected && (
                      <span style={{ fontSize: 16, color: acc.color }}>✓</span>
                    )}
                  </button>
                );
              })}
          </div>
        </Field>
        <Field label="Monto del pago (MXN)">
          <Input
            value={payTDCForm.amount}
            onChange={(v) => setPayTDCForm((f) => ({ ...f, amount: v }))}
            placeholder="0.00"
            type="number"
          />
        </Field>
        {payTDCForm.amount &&
          !isNaN(parseFloat(payTDCForm.amount)) &&
          (() => {
            const tdc = accounts.find((a) => a.id === payTDCForm.accountId);
            const nomina = accounts.find((a) => a.type === "debit");
            const amt = parseFloat(payTDCForm.amount);
            const newTDC = tdc ? Math.max(0, tdc.balance - amt) : 0;
            const newNomina = nomina ? nomina.balance - amt : 0;
            const insufficient = nomina && amt > nomina.balance;
            return (
              <div
                style={{
                  background: insufficient ? C.redDim : C.elevated,
                  borderRadius: 12,
                  padding: "12px 14px",
                  marginBottom: 14,
                  border: `1px solid ${insufficient ? C.red + "66" : C.border}`,
                }}
              >
                {insufficient ? (
                  <div
                    style={{
                      fontSize: 12,
                      color: C.red,
                      fontWeight: 800,
                      marginBottom: 4,
                    }}
                  >
                    ⚠️ SALDO INSUFICIENTE EN {nomina?.name?.toUpperCase()} —
                    Faltan {mxn(amt - nomina.balance)}
                  </div>
                ) : (
                  <div
                    style={{
                      fontSize: 11,
                      color: C.green,
                      fontWeight: 700,
                      marginBottom: 10,
                    }}
                  >
                    ✓ IMPACTO DEL PAGO
                  </div>
                )}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 8,
                  }}
                >
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 6 }}
                  >
                    <span style={{ fontSize: 14 }}>💳</span>
                    <span style={{ fontSize: 12, color: C.sub }}>
                      {tdc?.name}
                    </span>
                  </div>
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 6 }}
                  >
                    <span
                      style={{ fontSize: 12, fontWeight: 700, color: C.red }}
                    >
                      {mxn(Math.abs(tdc?.balance || 0))}
                    </span>
                    <span style={{ fontSize: 11, color: C.muted }}>→</span>
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 800,
                        color: newTDC === 0 ? C.green : C.orange,
                      }}
                    >
                      {mxn(Math.abs(newTDC))}
                    </span>
                  </div>
                </div>
                {nomina && (
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      paddingTop: 8,
                      borderTop: `1px solid ${C.border}`,
                    }}
                  >
                    <div
                      style={{ display: "flex", alignItems: "center", gap: 6 }}
                    >
                      <span style={{ fontSize: 14 }}>🏦</span>
                      <span style={{ fontSize: 12, color: C.sub }}>
                        {nomina.name}
                      </span>
                    </div>
                    <div
                      style={{ display: "flex", alignItems: "center", gap: 6 }}
                    >
                      <span
                        style={{ fontSize: 12, fontWeight: 700, color: C.text }}
                      >
                        {mxn(nomina.balance)}
                      </span>
                      <span style={{ fontSize: 11, color: C.muted }}>→</span>
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 800,
                          color: newNomina >= 0 ? C.text : C.red,
                        }}
                      >
                        {mxn(newNomina)}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
        <SaveBtn
          onClick={async () => {
            const amt = parseFloat(payTDCForm.amount);
            if (isNaN(amt) || amt <= 0) return;
            const nominaAcc = accounts.find((a) => a.type === "debit");
            if (nominaAcc && nominaAcc.balance < amt) {
              alert(
                `Saldo insuficiente en ${nominaAcc.name}.\nDisponible: ${mxn(nominaAcc.balance)}\nNecesitas: ${mxn(amt)}`,
              );
              return;
            }
            const tdcAcc = accounts.find((a) => a.id === payTDCForm.accountId);
            // Update TDC balance
            await sb
              .from("accounts")
              .update({ balance: Math.max(0, tdcAcc.balance - amt) })
              .eq("id", tdcAcc.id);
            // Update Nómina balance
            if (nominaAcc)
              await sb
                .from("accounts")
                .update({ balance: nominaAcc.balance - amt })
                .eq("id", nominaAcc.id);
            // Register expense
            await sb
              .from("expenses")
              .insert({
                user_id: session?.user?.id,
                description: `Pago ${tdcAcc?.name || "TDC"}`,
                amount: amt,
                date: today(),
                account_id: nominaAcc?.id || tdcAcc.id,
                category_id: null,
                payment_date: null,
                is_msi: false,
                is_tdc_payment: true,
                is_subscription: false,
              });
            setPayTDCForm((f) => ({ ...f, amount: "" }));
            setShowPayTDC(false);
            if (reloadAll) await reloadAll();
          }}
          color={C.green}
        >
          Registrar Pago
        </SaveBtn>
      </Modal>
    </div>
  );
}

// ─── SUBSCRIPTIONS ────────────────────────────────────────────────────────────
function Subscriptions({
  subs,
  setSubs,
  accounts,
  expenses,
  setExpenses,
  categories,
  session,
  reloadAll,
}) {
  const [showModal, setShowModal] = useState(false);
  const [editingSub, setEditingSub] = useState(null);
  const [nextId, setNextId] = useState(50);
  const [nextExpId, setNextExpId] = useState(300);
  const emptyForm = {
    name: "",
    amount: "",
    frequency: "monthly",
    categoryId: 1,
    accountId: accounts[0]?.id || 2,
    chargeDay: 1,
  };
  const [form, setForm] = useState(emptyForm);

  const totalMonthly = subs
    .filter((s) => s.active && s.frequency === "monthly")
    .reduce((s, sub) => s + sub.amount, 0);
  const currentMonth = getCurrentMonth();

  const chargeThisMonth = (sub) => {
    const chargeDate = `${currentMonth}-${String(sub.chargeDay).padStart(2, "0")}`;
    return !expenses.some(
      (e) =>
        e.description === sub.name &&
        e.date === chargeDate &&
        e.accountId === sub.accountId,
    );
  };

  const manualCharge = async (sub) => {
    const chargeDate = `${currentMonth}-${String(sub.chargeDay).padStart(2, "0")}`;
    const acc = accounts.find((a) => a.id === sub.accountId);
    const pd =
      acc?.type === "credit" && acc.cutDay && acc.payDay
        ? calcPaymentDate(chargeDate, acc.cutDay, acc.payDay)
        : null;
    await sb
      .from("expenses")
      .insert({
        user_id: session?.user?.id,
        description: sub.name,
        amount: sub.amount,
        date: chargeDate,
        account_id: sub.accountId || null,
        category_id: sub.categoryId || null,
        payment_date: pd,
        is_msi: false,
        is_tdc_payment: false,
        is_subscription: true,
      });
    if (acc)
      await sb
        .from("accounts")
        .update({
          balance:
            acc.type === "credit"
              ? acc.balance + sub.amount
              : acc.balance - sub.amount,
        })
        .eq("id", acc.id);
    if (reloadAll) await reloadAll();
  };

  const openAdd = () => {
    setEditingSub(null);
    setForm(emptyForm);
    setShowModal(true);
  };
  const openEdit = (sub) => {
    setEditingSub(sub);
    setForm({
      name: sub.name,
      amount: String(sub.amount),
      frequency: sub.frequency,
      categoryId: sub.categoryId,
      accountId: sub.accountId,
      chargeDay: sub.chargeDay,
    });
    setShowModal(true);
  };

  const save = async () => {
    if (!form.name.trim() || !form.amount) return;
    const data = {
      name: form.name.trim(),
      amount: parseFloat(form.amount),
      frequency: form.frequency,
      category_id: form.categoryId || null,
      account_id: form.accountId || null,
      charge_day: form.chargeDay,
      active: true,
    };
    if (editingSub) {
      await sb.from("subscriptions").update(data).eq("id", editingSub.id);
    } else {
      await sb
        .from("subscriptions")
        .insert({ ...data, user_id: session?.user?.id });
    }
    setShowModal(false);
    if (reloadAll) await reloadAll();
  };

  const deleteSub = async () => {
    await sb.from("subscriptions").delete().eq("id", editingSub.id);
    setShowModal(false);
    if (reloadAll) await reloadAll();
  };

  const SubRow = ({ sub }) => {
    const acc = accounts.find((a) => a.id === sub.accountId);
    const cat = categories.find((c) => c.id === sub.categoryId);
    const next = nextOccurrence(sub.chargeDay);
    const d = daysUntil(next);
    const notCharged = chargeThisMonth(sub);
    const pd =
      acc?.type === "credit" && acc.cutDay && acc.payDay
        ? calcPaymentDate(next, acc.cutDay, acc.payDay)
        : null;
    return (
      <div
        style={{
          background: C.card,
          borderRadius: 14,
          padding: "12px 14px",
          marginBottom: 8,
          border: `1px solid ${d <= 3 ? C.orange + "44" : C.border}`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 11,
              background: C.accentDim,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 20,
              flexShrink: 0,
            }}
          >
            🔄
          </div>
          <div style={{ flex: 1 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                marginBottom: 3,
              }}
            >
              <span style={{ fontSize: 14, fontWeight: 800, color: C.text }}>
                {sub.name}
              </span>
              {!notCharged && <Badge color={C.green}>✓ Cobrado</Badge>}
              {d <= 3 && notCharged && (
                <Badge color={C.orange}>
                  Próximo {d === 0 ? "hoy" : `${d}d`}
                </Badge>
              )}
            </div>
            <div
              style={{
                display: "flex",
                gap: 6,
                flexWrap: "wrap",
                alignItems: "center",
              }}
            >
              {acc && <Tag color={acc.color}>{acc.name}</Tag>}
              {cat && (
                <span style={{ fontSize: 10, color: C.sub }}>{cat.name}</span>
              )}
              <span style={{ fontSize: 10, color: C.muted }}>
                Día {sub.chargeDay} c/mes
              </span>
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: C.text }}>
              {mxn(sub.amount)}
            </div>
            {pd && (
              <div style={{ fontSize: 9, color: C.blue, marginTop: 2 }}>
                Paga: {fmtDateShort(pd)}
              </div>
            )}
          </div>
          <button
            onClick={() => openEdit(sub)}
            style={{
              background: C.elevated,
              border: `1px solid ${C.border}`,
              borderRadius: 8,
              padding: "6px 8px",
              color: C.sub,
              fontSize: 13,
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            ✏️
          </button>
        </div>
        {notCharged && (
          <button
            onClick={() => manualCharge(sub)}
            style={{
              width: "100%",
              marginTop: 10,
              background: C.accentDim,
              border: `1px solid ${C.accent}44`,
              borderRadius: 10,
              padding: "8px 0",
              color: C.accent,
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            ⚡ Registrar cargo de este mes
          </button>
        )}
      </div>
    );
  };

  const previewPayDate = () => {
    const acc = accounts.find((a) => a.id === form.accountId);
    if (acc?.type === "credit" && acc.cutDay && acc.payDay) {
      const pd = calcPaymentDate(
        nextOccurrence(form.chargeDay),
        acc.cutDay,
        acc.payDay,
      );
      return (
        <div
          style={{
            background: C.accentDim,
            borderRadius: 10,
            padding: "9px 12px",
            marginBottom: 14,
            border: `1px solid ${C.accent}33`,
          }}
        >
          <div style={{ fontSize: 10, color: C.accent, fontWeight: 700 }}>
            📅 Aparece en estado de cuenta a pagar el <b>{fmtDate(pd)}</b>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div style={{ paddingBottom: 80 }}>
      <div
        style={{
          padding: "20px 20px 10px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
        }}
      >
        <div>
          <div style={{ fontSize: 26, fontWeight: 900, color: C.text }}>
            Suscripciones
          </div>
          <div style={{ fontSize: 13, color: C.sub, marginTop: 2 }}>
            {mxn(totalMonthly)}/mes · {mxn(totalMonthly * 12)}/año
          </div>
        </div>
        <button
          onClick={openAdd}
          style={{
            background: C.accent,
            border: "none",
            borderRadius: 22,
            width: 44,
            height: 44,
            color: "#fff",
            fontSize: 22,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          +
        </button>
      </div>
      <div style={{ padding: "0 20px 16px", display: "flex", gap: 10 }}>
        {[
          {
            icon: "🔄",
            val: subs.filter((s) => s.frequency === "monthly").length,
            label: "Mensuales",
            color: C.accent,
          },
          {
            icon: "💸",
            val: mxn(totalMonthly, true),
            label: "Gasto/mes",
            color: C.red,
          },
          {
            icon: "📅",
            val: mxn(totalMonthly * 12, true),
            label: "Al año",
            color: C.orange,
          },
        ].map((s, i) => (
          <div
            key={i}
            style={{
              flex: 1,
              background: C.card,
              borderRadius: 14,
              padding: "10px 8px",
              border: `1px solid ${C.border}`,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 3,
            }}
          >
            <span style={{ fontSize: 16 }}>{s.icon}</span>
            <span style={{ fontSize: 15, fontWeight: 900, color: s.color }}>
              {s.val}
            </span>
            <span style={{ fontSize: 9, color: C.muted }}>{s.label}</span>
          </div>
        ))}
      </div>
      <div style={{ padding: "0 20px" }}>
        {subs.map((sub) => (
          <SubRow key={sub.id} sub={sub} />
        ))}
        {subs.length === 0 && (
          <div style={{ textAlign: "center", paddingTop: 60, color: C.muted }}>
            <div style={{ fontSize: 40 }}>🔄</div>
            <div style={{ marginTop: 10 }}>Sin suscripciones</div>
          </div>
        )}
      </div>

      <Modal
        open={showModal}
        onClose={() => setShowModal(false)}
        title={editingSub ? "Editar Suscripción" : "Nueva Suscripción"}
      >
        <Field label="Nombre del servicio">
          <Input
            value={form.name}
            onChange={(v) => setForm((f) => ({ ...f, name: v }))}
            placeholder="Ej. Netflix, Gym..."
          />
        </Field>
        <Field label="Monto mensual (MXN)">
          <Input
            value={form.amount}
            onChange={(v) => setForm((f) => ({ ...f, amount: v }))}
            placeholder="0.00"
            type="number"
          />
        </Field>
        <Field label="Día de cobro" hint="¿Qué día del mes te cobran?">
          <Stepper
            value={form.chargeDay}
            onChange={(v) => setForm((f) => ({ ...f, chargeDay: v }))}
            min={1}
            max={31}
          />
          <p style={{ fontSize: 11, color: C.sub, margin: "6px 0 0" }}>
            Próximo cargo:{" "}
            <b style={{ color: C.orange }}>
              {fmtDate(nextOccurrence(form.chargeDay))}
            </b>
          </p>
        </Field>
        <Field label="Cuenta de cargo">
          <ChipSelect
            options={accounts}
            value={form.accountId}
            onChange={(v) => setForm((f) => ({ ...f, accountId: v }))}
            getColor={(a) => a.color}
          />
        </Field>
        {previewPayDate()}
        <Field label="Categoría">
          <ChipSelect
            options={categories}
            value={form.categoryId}
            onChange={(v) => setForm((f) => ({ ...f, categoryId: v }))}
            getColor={(c) => c.color}
          />
        </Field>
        {editingSub && (
          <button
            onClick={deleteSub}
            style={{
              width: "100%",
              background: C.redDim,
              border: `1px solid ${C.red}44`,
              borderRadius: 12,
              padding: "11px 0",
              color: C.red,
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
              marginBottom: 8,
            }}
          >
            🗑 Eliminar suscripción
          </button>
        )}
        <SaveBtn onClick={save}>
          {editingSub ? "Guardar Cambios" : "Guardar Suscripción"}
        </SaveBtn>
      </Modal>
    </div>
  );
}

// ─── GOALS ────────────────────────────────────────────────────────────────────
function Goals({
  goals,
  setGoals,
  accounts,
  setAccounts,
  goalWithdrawals,
  session,
  reloadAll,
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState(null);
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [withdrawGoal, setWithdrawGoal] = useState(null);
  const [withdrawAmt, setWithdrawAmt] = useState("");
  const [withdrawConcept, setWithdrawConcept] = useState("");
  const [editForm, setEditForm] = useState({
    name: "",
    target: "",
    current: "",
    icon: "🎯",
    color: "#00D08A",
  });
  const [addForm, setAddForm] = useState({
    name: "",
    target: "",
    current: "0",
    icon: "🎯",
    color: "#00D08A",
  });
  const [nextId, setNextId] = useState(20);
  const [openHistory, setOpenHistory] = useState({});

  const withdrawalsByGoal = useMemo(() => {
    const map = {};
    (goalWithdrawals || []).forEach((w) => {
      if (!map[w.goalId]) map[w.goalId] = [];
      map[w.goalId].push(w);
    });
    return map;
  }, [goalWithdrawals]);

  const ICONS = [
    "🎯",
    "🚀",
    "💍",
    "💒",
    "🛡️",
    "🏠",
    "🚗",
    "✈️",
    "🏆",
    "📚",
    "💪",
    "🎸",
  ];
  const COLS = [
    C.green,
    C.gold,
    "#FF6B9D",
    C.red,
    C.blue,
    C.orange,
    C.accent,
    "#00B4D8",
  ];

  const debitAccounts = accounts.filter((a) => a.type === "debit");

  const openEdit = (goal) => {
    setEditing(goal);
    setEditForm({
      name: goal.name,
      target: String(goal.target),
      current: String(goal.current),
      icon: goal.icon,
      color: goal.color,
    });
  };

  const saveEdit = async () => {
    const cur = parseFloat(editForm.current);
    const tar = parseFloat(editForm.target);
    if (!editForm.name || isNaN(tar) || tar <= 0) return;
    await sb
      .from("goals")
      .update({
        name: editForm.name,
        target_amount: tar,
        current_amount: isNaN(cur) ? editing.current : cur,
        icon: editForm.icon,
        color: editForm.color,
      })
      .eq("id", editing.id);
    setEditing(null);
    if (reloadAll) await reloadAll();
  };

  const deleteGoal = async () => {
    await sb.from("goals").delete().eq("id", editing.id);
    setEditing(null);
    if (reloadAll) await reloadAll();
  };

  const deleteWithdrawal = async (w, goal) => {
    if (
      !window.confirm("¿Eliminar este retiro? El monto regresará a la cuenta.")
    )
      return;
    await sb.from("goal_withdrawals").delete().eq("id", w.id);
    const acc = accounts.find((a) => a.id === w.accountId);
    if (acc)
      await sb
        .from("accounts")
        .update({ balance: acc.balance - w.amount })
        .eq("id", acc.id);
    await sb
      .from("goals")
      .update({ current_amount: goal.current + w.amount })
      .eq("id", goal.id);
    if (reloadAll) await reloadAll();
  };

  const openWithdraw = (goal) => {
    setWithdrawGoal(goal);
    setWithdrawAmt("");
    setWithdrawConcept("");
    setShowWithdraw(true);
  };

  const doWithdraw = async (targetAccountId) => {
    const amt = parseFloat(withdrawAmt);
    if (isNaN(amt) || amt <= 0 || amt > withdrawGoal.current) return;
    await sb
      .from("goals")
      .update({ current_amount: Math.max(0, withdrawGoal.current - amt) })
      .eq("id", withdrawGoal.id);
    const acc = accounts.find((a) => a.id === targetAccountId);
    if (acc)
      await sb
        .from("accounts")
        .update({ balance: acc.balance + amt })
        .eq("id", targetAccountId);
    await sb
      .from("goal_withdrawals")
      .insert({
        user_id: session?.user?.id,
        goal_id: withdrawGoal.id,
        account_id: targetAccountId,
        amount: amt,
        date: today(),
        concept: withdrawConcept.trim() || null,
      });
    setShowWithdraw(false);
    setWithdrawGoal(null);
    setWithdrawAmt("");
    setWithdrawConcept("");
    if (reloadAll) await reloadAll();
  };

  const saveAdd = async () => {
    if (!addForm.name || !addForm.target) return;
    await sb
      .from("goals")
      .insert({
        user_id: session?.user?.id,
        name: addForm.name,
        target_amount: parseFloat(addForm.target),
        current_amount: parseFloat(addForm.current) || 0,
        icon: addForm.icon,
        color: addForm.color,
      });
    setAddForm({
      name: "",
      target: "",
      current: "0",
      icon: "🎯",
      color: "#00D08A",
    });
    setShowAdd(false);
    if (reloadAll) await reloadAll();
  };

  const ColorPicker = ({ value, onChange }) => (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {COLS.map((col) => (
        <button
          key={col}
          onClick={() => onChange(col)}
          style={{
            width: 34,
            height: 34,
            borderRadius: 17,
            background: col,
            border: "none",
            cursor: "pointer",
            outline: value === col ? "3px solid #fff" : "none",
            outlineOffset: 2,
          }}
        />
      ))}
    </div>
  );
  const IconPicker = ({ value, onChange, color }) => (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      {ICONS.map((ic) => (
        <button
          key={ic}
          onClick={() => onChange(ic)}
          style={{
            width: 40,
            height: 40,
            borderRadius: 10,
            border: "none",
            background: value === ic ? color + "44" : C.card,
            fontSize: 20,
            cursor: "pointer",
            outline:
              value === ic ? `2px solid ${color}` : `1px solid ${C.border}`,
          }}
        >
          {ic}
        </button>
      ))}
    </div>
  );

  return (
    <div style={{ paddingBottom: 80 }}>
      <div
        style={{
          padding: "20px 20px 10px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
        }}
      >
        <div>
          <div style={{ fontSize: 26, fontWeight: 900, color: C.text }}>
            Metas
          </div>
          <div style={{ fontSize: 13, color: C.sub, marginTop: 2 }}>
            {mxn(goals.reduce((s, g) => s + g.current, 0))} ahorrado
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => setShowWithdraw(true)}
            style={{
              background: C.orangeDim,
              border: `1px solid ${C.orange}44`,
              borderRadius: 22,
              width: 44,
              height: 44,
              color: C.orange,
              fontSize: 20,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            💸
          </button>
          <button
            onClick={() => setShowAdd(true)}
            style={{
              background: C.green,
              border: "none",
              borderRadius: 22,
              width: 44,
              height: 44,
              color: "#fff",
              fontSize: 22,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            +
          </button>
        </div>
      </div>

      <div
        style={{
          padding: "0 20px",
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        {goals.map((goal) => {
          const pct = goal.target > 0 ? (goal.current / goal.target) * 100 : 0;
          const done = pct >= 100;
          return (
            <div
              key={goal.id}
              style={{
                background: C.card,
                borderRadius: 18,
                padding: 16,
                border: `1px solid ${done ? goal.color + "55" : C.border}`,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  marginBottom: 10,
                }}
              >
                <div
                  style={{
                    width: 46,
                    height: 46,
                    borderRadius: 13,
                    background: goal.color + "22",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 24,
                    flexShrink: 0,
                  }}
                >
                  {goal.icon}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 15, fontWeight: 800, color: C.text }}>
                    {goal.name}
                  </div>
                  {done && (
                    <span
                      style={{ fontSize: 10, color: C.green, fontWeight: 800 }}
                    >
                      ✓ META ALCANZADA
                    </span>
                  )}
                </div>
                <div
                  style={{
                    fontSize: 22,
                    fontWeight: 900,
                    color: done ? C.green : goal.color,
                  }}
                >
                  {pct.toFixed(0)}%
                </div>
              </div>
              <ProgressBar
                pct={pct}
                color={done ? C.green : goal.color}
                h={8}
              />
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginTop: 10,
                }}
              >
                <div>
                  <span
                    style={{ fontSize: 13, fontWeight: 700, color: C.text }}
                  >
                    {mxn(goal.current)}
                  </span>
                  <span style={{ fontSize: 11, color: C.sub }}>
                    {" "}
                    / {mxn(goal.target)}
                  </span>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button
                    onClick={() => openWithdraw(goal)}
                    style={{
                      background: C.orangeDim,
                      border: `1px solid ${C.orange}44`,
                      borderRadius: 8,
                      padding: "5px 9px",
                      color: C.orange,
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    💸 Retirar
                  </button>
                  <button
                    onClick={() => openEdit(goal)}
                    style={{
                      background: C.elevated,
                      border: `1px solid ${C.border}`,
                      borderRadius: 8,
                      padding: "5px 9px",
                      color: C.sub,
                      fontSize: 12,
                      cursor: "pointer",
                    }}
                  >
                    ✏️
                  </button>
                </div>
              </div>
              {/* Withdrawal history toggle */}
              {(withdrawalsByGoal[goal.id] || []).length > 0 && (
                <div
                  style={{
                    marginTop: 10,
                    borderTop: `1px solid ${C.border}`,
                    paddingTop: 8,
                  }}
                >
                  <button
                    onClick={() =>
                      setOpenHistory((h) => ({ ...h, [goal.id]: !h[goal.id] }))
                    }
                    style={{
                      background: "none",
                      border: "none",
                      padding: 0,
                      cursor: "pointer",
                      width: "100%",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 800,
                        color: C.muted,
                        textTransform: "uppercase",
                        letterSpacing: 0.8,
                      }}
                    >
                      📋 Historial de retiros (
                      {(withdrawalsByGoal[goal.id] || []).length})
                    </span>
                    <span
                      style={{
                        fontSize: 12,
                        color: C.muted,
                        transition: "transform .2s",
                        display: "inline-block",
                        transform: openHistory[goal.id]
                          ? "rotate(180deg)"
                          : "rotate(0deg)",
                      }}
                    >
                      ▾
                    </span>
                  </button>
                  {openHistory[goal.id] && (
                    <div
                      style={{
                        marginTop: 8,
                        display: "flex",
                        flexDirection: "column",
                        gap: 6,
                      }}
                    >
                      {(withdrawalsByGoal[goal.id] || []).map((r, i) => {
                        const acc = accounts.find((a) => a.id === r.accountId);
                        return (
                          <div
                            key={r.id || i}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 10,
                              background: C.elevated,
                              borderRadius: 10,
                              padding: "8px 10px",
                              border: `1px solid ${C.border}`,
                            }}
                          >
                            <div
                              style={{
                                width: 30,
                                height: 30,
                                borderRadius: 8,
                                background: C.orangeDim,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: 14,
                                flexShrink: 0,
                              }}
                            >
                              💸
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div
                                style={{
                                  fontSize: 12,
                                  fontWeight: 700,
                                  color: C.text,
                                }}
                              >
                                {r.concept || "—"}
                              </div>
                              <div
                                style={{
                                  fontSize: 10,
                                  color: C.sub,
                                  marginTop: 1,
                                }}
                              >
                                {mxn(r.amount)} → {acc?.name || "Cuenta"}
                                <span style={{ color: C.muted, marginLeft: 6 }}>
                                  {fmtDate(r.date)}
                                </span>
                              </div>
                            </div>
                            <button
                              onClick={() => deleteWithdrawal(r, goal)}
                              style={{
                                background: "none",
                                border: "none",
                                color: C.red,
                                fontSize: 16,
                                cursor: "pointer",
                                padding: "2px 4px",
                                flexShrink: 0,
                              }}
                            >
                              🗑
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {goals.length === 0 && (
          <div style={{ textAlign: "center", paddingTop: 60, color: C.muted }}>
            <div style={{ fontSize: 40 }}>🎯</div>
            <div style={{ marginTop: 10 }}>Sin metas</div>
          </div>
        )}
      </div>

      {/* EDIT MODAL */}
      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title="Editar Meta"
      >
        <Field label="Nombre">
          <Input
            value={editForm.name}
            onChange={(v) => setEditForm((f) => ({ ...f, name: v }))}
            placeholder="Nombre..."
          />
        </Field>
        <Field label="Monto Objetivo (MXN)">
          <Input
            value={editForm.target}
            onChange={(v) => setEditForm((f) => ({ ...f, target: v }))}
            placeholder="50000"
            type="number"
          />
        </Field>
        <Field label="Monto Actual (MXN)">
          <Input
            value={editForm.current}
            onChange={(v) => setEditForm((f) => ({ ...f, current: v }))}
            placeholder="0"
            type="number"
          />
        </Field>
        <Field label="Ícono">
          <IconPicker
            value={editForm.icon}
            onChange={(v) => setEditForm((f) => ({ ...f, icon: v }))}
            color={editForm.color}
          />
        </Field>
        <Field label="Color">
          <ColorPicker
            value={editForm.color}
            onChange={(v) => setEditForm((f) => ({ ...f, color: v }))}
          />
        </Field>
        <button
          onClick={deleteGoal}
          style={{
            width: "100%",
            background: C.redDim,
            border: `1px solid ${C.red}44`,
            borderRadius: 12,
            padding: "11px 0",
            color: C.red,
            fontSize: 13,
            fontWeight: 700,
            cursor: "pointer",
            marginBottom: 8,
            marginTop: 4,
          }}
        >
          🗑 Eliminar meta
        </button>
        <SaveBtn onClick={saveEdit} color={editForm.color}>
          Guardar Cambios
        </SaveBtn>
      </Modal>

      {/* WITHDRAW MODAL */}
      <Modal
        open={showWithdraw && !editForm.name}
        onClose={() => {
          setShowWithdraw(false);
          setWithdrawGoal(null);
        }}
        title="Retirar de Meta"
      >
        {!withdrawGoal && goals.length > 0 && (
          <>
            <div style={{ fontSize: 12, color: C.sub, marginBottom: 12 }}>
              ¿De qué meta retiras?
            </div>
            {goals.map((g) => (
              <button
                key={g.id}
                onClick={() => setWithdrawGoal(g)}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  background: C.card,
                  border: `1px solid ${C.border}`,
                  borderRadius: 12,
                  padding: "12px 14px",
                  marginBottom: 8,
                  cursor: "pointer",
                }}
              >
                <span style={{ fontSize: 22 }}>{g.icon}</span>
                <div style={{ flex: 1, textAlign: "left" }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: C.text }}>
                    {g.name}
                  </div>
                  <div style={{ fontSize: 11, color: C.sub }}>
                    {mxn(g.current)} disponible
                  </div>
                </div>
              </button>
            ))}
          </>
        )}
        {withdrawGoal && (
          <>
            <div
              style={{
                background: withdrawGoal.color + "22",
                borderRadius: 12,
                padding: "10px 14px",
                marginBottom: 16,
                display: "flex",
                alignItems: "center",
                gap: 10,
              }}
            >
              <span style={{ fontSize: 22 }}>{withdrawGoal.icon}</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 800, color: C.text }}>
                  {withdrawGoal.name}
                </div>
                <div style={{ fontSize: 11, color: C.sub }}>
                  Disponible: {mxn(withdrawGoal.current)}
                </div>
              </div>
            </div>
            <Field label="Monto a retirar (MXN)">
              <Input
                value={withdrawAmt}
                onChange={setWithdrawAmt}
                placeholder="0.00"
                type="number"
              />
            </Field>
            <Field label="Concepto" hint="¿Para qué es este retiro?">
              <Input
                value={withdrawConcept}
                onChange={setWithdrawConcept}
                placeholder="Ej. Pago de renta, Compra laptop..."
              />
            </Field>
            <Field label="Enviar a cuenta de débito">
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {debitAccounts.map((acc) => (
                  <button
                    key={acc.id}
                    onClick={() => doWithdraw(acc.id)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      background: C.card,
                      border: `1.5px solid ${acc.color}44`,
                      borderRadius: 12,
                      padding: "12px 14px",
                      cursor: "pointer",
                    }}
                  >
                    <span style={{ fontSize: 20 }}>🏦</span>
                    <div style={{ flex: 1, textAlign: "left" }}>
                      <div
                        style={{ fontSize: 13, fontWeight: 800, color: C.text }}
                      >
                        {acc.name}
                      </div>
                      <div style={{ fontSize: 11, color: C.sub }}>
                        Saldo: {mxn(acc.balance)}
                      </div>
                    </div>
                    <div
                      style={{ fontSize: 12, fontWeight: 800, color: C.green }}
                    >
                      {withdrawAmt &&
                        !isNaN(parseFloat(withdrawAmt)) &&
                        `→ ${mxn(acc.balance + parseFloat(withdrawAmt))}`}
                    </div>
                  </button>
                ))}
                {debitAccounts.length === 0 && (
                  <div
                    style={{
                      color: C.muted,
                      fontSize: 12,
                      textAlign: "center",
                      padding: "10px 0",
                    }}
                  >
                    No tienes cuentas de débito
                  </div>
                )}
              </div>
            </Field>
            <button
              onClick={() => setWithdrawGoal(null)}
              style={{
                width: "100%",
                background: "none",
                border: "none",
                color: C.sub,
                fontSize: 12,
                cursor: "pointer",
                marginTop: 4,
              }}
            >
              ← Cambiar meta
            </button>
          </>
        )}
      </Modal>

      {/* ADD MODAL */}
      <Modal
        open={showAdd}
        onClose={() => setShowAdd(false)}
        title="Nueva Meta"
      >
        <Field label="Nombre">
          <Input
            value={addForm.name}
            onChange={(v) => setAddForm((f) => ({ ...f, name: v }))}
            placeholder="Ej. Viaje a Tokio..."
          />
        </Field>
        <Field label="Monto Objetivo">
          <Input
            value={addForm.target}
            onChange={(v) => setAddForm((f) => ({ ...f, target: v }))}
            placeholder="50000"
            type="number"
          />
        </Field>
        <Field label="Monto Actual">
          <Input
            value={addForm.current}
            onChange={(v) => setAddForm((f) => ({ ...f, current: v }))}
            placeholder="0"
            type="number"
          />
        </Field>
        <Field label="Ícono">
          <IconPicker
            value={addForm.icon}
            onChange={(v) => setAddForm((f) => ({ ...f, icon: v }))}
            color={addForm.color}
          />
        </Field>
        <Field label="Color">
          <ColorPicker
            value={addForm.color}
            onChange={(v) => setAddForm((f) => ({ ...f, color: v }))}
          />
        </Field>
        <SaveBtn onClick={saveAdd} color={addForm.color}>
          Crear Meta
        </SaveBtn>
      </Modal>
    </div>
  );
}

// ─── MSI ──────────────────────────────────────────────────────────────────────
function MSISummary({ calcPaidMonths, form, C, mxn }) {
  const paid = calcPaidMonths(form.startDate, form.months);
  const totalM = parseInt(form.months) || 0;
  const rem = Math.max(0, totalM - paid);
  const monthly =
    totalM > 0 && parseFloat(form.total) > 0
      ? Math.round((parseFloat(form.total) / totalM) * 100) / 100
      : 0;
  return (
    <div
      style={{
        background: C.elevated,
        borderRadius: 11,
        padding: "11px 13px",
        marginBottom: 14,
        border: `1px solid ${paid > 0 ? C.orange + "55" : C.border}`,
        borderLeft: `3px solid ${paid > 0 ? C.orange : C.border}`,
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: C.sub,
          textTransform: "uppercase",
          letterSpacing: 0.5,
          marginBottom: 6,
        }}
      >
        Resumen estimado
      </div>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 16, fontWeight: 900, color: C.green }}>
            {paid}
          </div>
          <div
            style={{
              fontSize: 9,
              color: C.muted,
              textTransform: "uppercase",
              letterSpacing: 0.3,
            }}
          >
            Pagados
          </div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 16, fontWeight: 900, color: C.orange }}>
            {rem}
          </div>
          <div
            style={{
              fontSize: 9,
              color: C.muted,
              textTransform: "uppercase",
              letterSpacing: 0.3,
            }}
          >
            Restantes
          </div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 16, fontWeight: 900, color: C.text }}>
            {totalM}
          </div>
          <div
            style={{
              fontSize: 9,
              color: C.muted,
              textTransform: "uppercase",
              letterSpacing: 0.3,
            }}
          >
            Total MSI
          </div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div
            style={{
              fontSize: 14,
              fontWeight: 900,
              color: rem > 0 ? C.red : C.green,
            }}
          >
            {mxn(rem * monthly, true)}
          </div>
          <div
            style={{
              fontSize: 9,
              color: C.muted,
              textTransform: "uppercase",
              letterSpacing: 0.3,
            }}
          >
            Pendiente
          </div>
        </div>
      </div>
    </div>
  );
}

function PlanCard({ plan, accounts, onEdit }) {
  const rem = Math.max(0, plan.totalM - plan.paidM);
  const pend = rem * plan.monthly;
  const pct = (plan.paidM / plan.totalM) * 100;
  const done = rem === 0;
  const acc = accounts.find((a) => a.id === plan.accountId);
  return (
    <div
      style={{
        background: C.card,
        borderRadius: 16,
        padding: 14,
        border: `1px solid ${done ? C.green + "44" : C.border}`,
        marginBottom: 8,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 11,
          marginBottom: 10,
        }}
      >
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 11,
            background: done ? C.greenDim : (acc?.color || C.accent) + "22",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 20,
            flexShrink: 0,
          }}
        >
          {done ? "✅" : "🔄"}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: C.text }}>
            {plan.desc}
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              marginTop: 4,
              flexWrap: "wrap",
            }}
          >
            {acc ? (
              <Tag color={acc.color}>💳 {acc.name}</Tag>
            ) : (
              <span style={{ fontSize: 10, color: C.muted }}>Sin tarjeta</span>
            )}
            {plan.startDate && (
              <span style={{ fontSize: 10, color: C.muted }}>
                {fmtDateShort(plan.startDate)}
              </span>
            )}
          </div>
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-end",
            gap: 4,
          }}
        >
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 17, fontWeight: 900, color: C.text }}>
              {mxn(plan.monthly)}
            </div>
            <div style={{ fontSize: 10, color: C.muted }}>/ mes</div>
          </div>
          <button
            onClick={() => onEdit(plan)}
            style={{
              background: C.elevated,
              border: `1px solid ${C.border}`,
              borderRadius: 8,
              padding: "3px 8px",
              color: C.sub,
              fontSize: 11,
              cursor: "pointer",
            }}
          >
            ✏️ Editar
          </button>
        </div>
      </div>
      <ProgressBar pct={pct} color={done ? C.green : C.accent} h={5} />
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginTop: 8,
        }}
      >
        {[
          { l: "Pagados", v: plan.paidM, c: C.text },
          { l: "Restan", v: rem, c: done ? C.green : C.orange },
          { l: "Total", v: `${plan.totalM} MSI`, c: C.sub },
          { l: "Pendiente", v: mxn(pend, true), c: done ? C.green : C.red },
        ].map((s, i) => (
          <div
            key={i}
            style={{
              flex: 1,
              textAlign: "center",
              borderRight: i < 3 ? `1px solid ${C.border}` : "none",
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 800, color: s.c }}>
              {s.v}
            </div>
            <div
              style={{
                fontSize: 9,
                color: C.muted,
                marginTop: 1,
                textTransform: "uppercase",
                letterSpacing: 0.3,
              }}
            >
              {s.l}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MSI({ plans, setPlans, accounts, session, reloadAll }) {
  const [showModal, setShowModal] = useState(false);
  const [editingPlan, setEditingPlan] = useState(null);
  const [openActive, setOpenActive] = useState(true);
  const [openDone, setOpenDone] = useState(false);
  const emptyForm = {
    desc: "",
    total: "",
    monthly: "",
    months: "12",
    accountId: accounts[0]?.id || "",
    startDate: today(),
    paidMonths: 0,
  };
  const [form, setForm] = useState(emptyForm);

  const active = plans.filter((p) => p.paidM < p.totalM);
  const done = plans.filter((p) => p.paidM >= p.totalM);
  const totalPending = active.reduce(
    (s, p) => s + (p.totalM - p.paidM) * p.monthly,
    0,
  );

  const calcPaidMonths = (startDate, totalMonths) => {
    if (!startDate) return 0;
    const acc = accounts.find((a) => a.id === form.accountId);
    if (acc?.cutDay && acc?.payDay) {
      const payDates = getMsiPaymentDates(
        startDate,
        acc,
        parseInt(totalMonths) || 0,
      );
      const now = new Date();
      const paid = payDates.filter(
        (pd) => new Date(pd + "T12:00:00") <= now,
      ).length;
      return Math.max(0, Math.min(paid, parseInt(totalMonths) || 0));
    }
    // Fallback for accounts without cut/pay days
    const start = new Date(startDate + "T00:00:00");
    const now = new Date();
    const elapsed =
      (now.getFullYear() - start.getFullYear()) * 12 +
      (now.getMonth() - start.getMonth());
    return Math.max(0, Math.min(elapsed, parseInt(totalMonths) || 0));
  };

  const openNew = () => {
    setEditingPlan(null);
    setForm(emptyForm);
    setShowModal(true);
  };
  const openEdit = (plan) => {
    setEditingPlan(plan);
    setForm({
      desc: plan.desc,
      total: String(plan.total),
      monthly: String(plan.monthly),
      months: String(plan.totalM),
      accountId: plan.accountId || accounts[0]?.id || "",
      startDate: plan.startDate || today(),
      paidMonths: plan.paidM,
    });
    setShowModal(true);
  };
  const closeModal = () => {
    setShowModal(false);
    setEditingPlan(null);
    setForm(emptyForm);
  };

  const save = async () => {
    if (!form.desc || !form.total) return;
    const paid = editingPlan
      ? parseInt(form.paidMonths) || 0
      : calcPaidMonths(form.startDate, form.months);
    const totalM = parseInt(form.months) || 0;
    const monthly = Math.round((parseFloat(form.total) / totalM) * 100) / 100;
    const data = {
      description: form.desc.trim(),
      total_amount: parseFloat(form.total),
      monthly_payment: monthly,
      total_months: totalM,
      paid_months: paid,
      account_id: form.accountId || null,
      start_date: form.startDate || today(),
    };

    if (editingPlan) {
      await sb.from("msi_plans").update(data).eq("id", editingPlan.id);
      // Sync the individual expense rows with the new amount and description
      const { data: msiRows } = await sb
        .from("expenses")
        .select("id, msi_index")
        .eq("msi_plan_id", editingPlan.id);
      if (msiRows?.length) {
        await Promise.all(msiRows.map((row) =>
          sb.from("expenses").update({
            amount: monthly,
            description: `${form.desc.trim()} (${row.msi_index}/${totalM})`,
          }).eq("id", row.id)
        ));
      }
    } else {
      const acc = accounts.find((a) => a.id === form.accountId);
      const { data: planRow } = await sb
        .from("msi_plans")
        .insert({ ...data, user_id: session?.user?.id })
        .select()
        .single();

      // Create expense rows only for upcoming installments (past ones already happened)
      if (planRow && acc?.cutDay && acc?.payDay) {
        const allDates = getMsiPaymentDates(
          form.startDate || today(),
          acc,
          totalM,
        );
        const futureDates = allDates.slice(paid);
        if (futureDates.length > 0) {
          const rows = futureDates.map((pd, i) => ({
            user_id: session?.user?.id,
            description: `${form.desc.trim()} (${paid + i + 1}/${totalM})`,
            amount: monthly,
            date: pd,
            account_id: acc.id,
            category_id: null,
            payment_date: pd,
            is_msi: true,
            msi_plan_id: planRow.id,
            msi_index: paid + i + 1,
            msi_total: totalM,
            is_tdc_payment: false,
            is_subscription: false,
          }));
          await sb.from("expenses").insert(rows);
        }
      }
      // Update balance using the exact total (avoids rounding from monthly × months)
      if (acc) {
        const totalAmt = parseFloat(form.total);
        await sb
          .from("accounts")
          .update({
            balance:
              acc.type === "credit"
                ? acc.balance + totalAmt
                : acc.balance - totalAmt,
          })
          .eq("id", acc.id);
      }
    }
    closeModal();
    if (reloadAll) await reloadAll();
  };

  const deletePlan = async () => {
    if (!window.confirm("¿Eliminar este plan MSI?")) return;
    const acc = accounts.find((a) => a.id === editingPlan.accountId);
    const remaining =
      (editingPlan.totalM - editingPlan.paidM) * editingPlan.monthly;
    await sb.from("expenses").delete().eq("msi_plan_id", editingPlan.id);
    await sb.from("msi_plans").delete().eq("id", editingPlan.id);
    if (acc)
      await sb
        .from("accounts")
        .update({
          balance:
            acc.type === "credit"
              ? acc.balance - remaining
              : acc.balance + remaining,
        })
        .eq("id", acc.id);
    closeModal();
    if (reloadAll) await reloadAll();
  };

  const SectionHeader = ({
    label,
    count,
    total,
    isOpen,
    onToggle,
    color = C.accent,
  }) => (
    <button
      onClick={onToggle}
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        gap: 10,
        background: C.card,
        border: `1px solid ${isOpen ? color + "55" : C.border}`,
        borderRadius: isOpen ? "14px 14px 0 0" : 14,
        padding: "12px 16px",
        cursor: "pointer",
        marginBottom: isOpen ? 0 : 10,
        transition: "border-radius .2s",
      }}
    >
      <div style={{ flex: 1, textAlign: "left" }}>
        <div
          style={{
            fontSize: 14,
            fontWeight: 800,
            color: isOpen ? color : C.text,
          }}
        >
          {label}
        </div>
        <div style={{ fontSize: 11, color: C.sub, marginTop: 2 }}>
          {count} plan{count !== 1 ? "es" : ""}
        </div>
      </div>
      {total > 0 && (
        <div style={{ fontSize: 14, fontWeight: 800, color }}>
          {mxn(total, true)}
        </div>
      )}
      <div
        style={{
          fontSize: 15,
          color: C.sub,
          transition: "transform .25s",
          transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
        }}
      >
        ▾
      </div>
    </button>
  );

  return (
    <div style={{ paddingBottom: 80 }}>
      <div
        style={{
          padding: "20px 20px 12px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
        }}
      >
        <div>
          <div style={{ fontSize: 26, fontWeight: 900, color: C.text }}>
            Planes MSI
          </div>
          <div style={{ fontSize: 13, color: C.sub, marginTop: 2 }}>
            Pendiente:{" "}
            <span style={{ color: C.orange, fontWeight: 800 }}>
              {mxn(totalPending)}
            </span>
          </div>
        </div>
        <button
          onClick={openNew}
          style={{
            background: C.orange,
            border: "none",
            borderRadius: 22,
            width: 44,
            height: 44,
            color: "#fff",
            fontSize: 22,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          +
        </button>
      </div>

      <div style={{ padding: "0 20px" }}>
        {/* Active plans */}
        <SectionHeader
          label="🔄 Activos"
          count={active.length}
          total={totalPending}
          isOpen={openActive}
          onToggle={() => setOpenActive((v) => !v)}
          color={C.accent}
        />
        {openActive && (
          <div
            style={{
              background: C.card,
              border: `1px solid ${C.accent}33`,
              borderTop: "none",
              borderRadius: "0 0 14px 14px",
              padding: "10px 10px 2px",
              marginBottom: 10,
            }}
          >
            {active.length > 0 ? (
              active.map((p) => (
                <PlanCard
                  key={p.id}
                  plan={p}
                  accounts={accounts}
                  onEdit={openEdit}
                />
              ))
            ) : (
              <div
                style={{
                  textAlign: "center",
                  padding: "20px 0",
                  color: C.muted,
                  fontSize: 12,
                }}
              >
                Sin planes activos
              </div>
            )}
          </div>
        )}

        {/* Completed plans */}
        <SectionHeader
          label="✅ Completados"
          count={done.length}
          total={0}
          isOpen={openDone}
          onToggle={() => setOpenDone((v) => !v)}
          color={C.green}
        />
        {openDone && (
          <div
            style={{
              background: C.card,
              border: `1px solid ${C.green}33`,
              borderTop: "none",
              borderRadius: "0 0 14px 14px",
              padding: "10px 10px 2px",
              marginBottom: 10,
            }}
          >
            {done.length > 0 ? (
              done.map((p) => (
                <PlanCard
                  key={p.id}
                  plan={p}
                  accounts={accounts}
                  onEdit={openEdit}
                />
              ))
            ) : (
              <div
                style={{
                  textAlign: "center",
                  padding: "20px 0",
                  color: C.muted,
                  fontSize: 12,
                }}
              >
                Sin planes completados
              </div>
            )}
          </div>
        )}
      </div>

      <Modal
        open={showModal}
        onClose={closeModal}
        title={editingPlan ? "Editar Plan MSI" : "Nuevo Plan MSI"}
      >
        <Field label="Descripción">
          <Input
            value={form.desc}
            onChange={(v) => setForm((f) => ({ ...f, desc: v }))}
            placeholder="Ej. MacBook Pro..."
          />
        </Field>
        <Field label="Número de MSI">
          <ChipSelect
            options={["3", "6", "9", "12", "18", "24"]}
            value={form.months}
            onChange={(v) => setForm((f) => ({ ...f, months: v }))}
          />
        </Field>
        <Field label="Monto Total (MXN)">
          <Input
            value={form.total}
            onChange={(v) => setForm((f) => ({ ...f, total: v }))}
            placeholder="0.00"
            type="number"
          />
        </Field>
        {form.total &&
          !isNaN(parseFloat(form.total)) &&
          parseInt(form.months) > 0 && (
            <div
              style={{
                background: C.orangeDim,
                borderRadius: 12,
                padding: "10px 14px",
                marginBottom: 14,
                border: `1px solid ${C.orange}44`,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span style={{ fontSize: 12, color: C.orange, fontWeight: 700 }}>
                📅 Pago mensual calculado
              </span>
              <span style={{ fontSize: 16, fontWeight: 900, color: C.text }}>
                {mxn(
                  Math.round(
                    (parseFloat(form.total) / parseInt(form.months)) * 100,
                  ) / 100,
                )}
              </span>
            </div>
          )}
        <Field label="Tarjeta">
          <ChipSelect
            options={accounts.filter((a) => a.type === "credit")}
            value={form.accountId}
            onChange={(v) => setForm((f) => ({ ...f, accountId: v }))}
            getColor={(a) => a.color}
          />
        </Field>
        <Field label="Fecha de compra" hint="¿Cuándo realizaste la compra?">
          <Input
            value={form.startDate}
            onChange={(v) => setForm((f) => ({ ...f, startDate: v }))}
            type="date"
          />
        </Field>
        {editingPlan ? (
          <Field label="Meses pagados" hint="Ajusta si es necesario">
            <NumberStepper
              value={parseInt(form.paidMonths) || 0}
              onChange={(v) => setForm((f) => ({ ...f, paidMonths: v }))}
              min={0}
              max={parseInt(form.months) || 24}
            />
          </Field>
        ) : (
          <MSISummary
            calcPaidMonths={calcPaidMonths}
            form={form}
            C={C}
            mxn={mxn}
          />
        )}
        {editingPlan && (
          <button
            onClick={deletePlan}
            style={{
              width: "100%",
              background: C.redDim,
              border: `1px solid ${C.red}44`,
              borderRadius: 12,
              padding: "12px 0",
              color: C.red,
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
              marginBottom: 8,
            }}
          >
            🗑 Eliminar plan
          </button>
        )}
        <SaveBtn onClick={save} color={C.orange}>
          {editingPlan ? "Guardar Cambios" : "Crear Plan MSI"}
        </SaveBtn>
      </Modal>
    </div>
  );
}

// ─── CATEGORIES SCREEN ────────────────────────────────────────────────────────
function Categories({ categories, setCategories }) {
  const CAT_ICONS = [
    "🏠",
    "🛒",
    "💕",
    "💰",
    "🚗",
    "✈️",
    "🍔",
    "🏋️",
    "💊",
    "🎮",
    "👔",
    "📚",
    "🐾",
    "🎁",
    "⚡",
    "📱",
    "🏥",
    "🎵",
  ];
  const CAT_COLORS = [
    "#FF5252",
    "#FF9800",
    "#E91E63",
    "#4CAF50",
    "#1976D2",
    "#820AD1",
    "#FF6B35",
    "#00796B",
    "#FF9F43",
    "#54A0FF",
    "#7C6FFF",
    "#FFD700",
    "#00D08A",
    "#F06292",
    "#26C6DA",
    "#AB47BC",
  ];

  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [nextId, setNextId] = useState(20);
  const emptyForm = { name: "", budget: "", icon: "🛒", color: "#FF9800" };
  const [form, setForm] = useState(emptyForm);

  const openAdd = () => {
    setEditing(null);
    setForm(emptyForm);
    setShowModal(true);
  };
  const openEdit = (cat) => {
    setEditing(cat);
    setForm({
      name: cat.name,
      budget: String(cat.budget),
      icon: cat.icon,
      color: cat.color,
    });
    setShowModal(true);
  };

  const save = async () => {
    if (!form.name.trim()) return;
    const budget = parseFloat(form.budget) || 0;
    if (editing) {
      await sb
        .from("categories")
        .update({
          name: form.name.trim(),
          budget,
          icon: form.icon,
          color: form.color,
        })
        .eq("id", editing.id);
    } else {
      await sb
        .from("categories")
        .insert({
          user_id: session?.user?.id,
          name: form.name.trim(),
          budget,
          icon: form.icon,
          color: form.color,
        });
    }
    setShowModal(false);
    if (reloadAll) await reloadAll();
  };

  const deleteCat = async () => {
    await sb.from("categories").delete().eq("id", editing.id);
    setShowModal(false);
    if (reloadAll) await reloadAll();
  };

  return (
    <div style={{ paddingBottom: 80 }}>
      <div
        style={{
          padding: "20px 20px 12px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
        }}
      >
        <div>
          <div style={{ fontSize: 26, fontWeight: 900, color: C.text }}>
            Categorías
          </div>
          <div style={{ fontSize: 13, color: C.sub, marginTop: 2 }}>
            Presupuesto total:{" "}
            <span style={{ color: C.accent, fontWeight: 800 }}>
              {mxn(categories.reduce((s, c) => s + c.budget, 0))}
            </span>
          </div>
        </div>
        <button
          onClick={openAdd}
          style={{
            background: C.accent,
            border: "none",
            borderRadius: 22,
            width: 44,
            height: 44,
            color: "#fff",
            fontSize: 22,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          +
        </button>
      </div>

      <div
        style={{
          padding: "0 20px",
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        {categories.map((cat) => (
          <div
            key={cat.id}
            style={{
              background: C.card,
              borderRadius: 16,
              padding: "13px 14px",
              border: `1px solid ${C.border}`,
              display: "flex",
              alignItems: "center",
              gap: 12,
            }}
          >
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                background: cat.color + "22",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 22,
                flexShrink: 0,
              }}
            >
              {cat.icon}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: C.text }}>
                {cat.name}
              </div>
              <div style={{ fontSize: 12, color: C.sub, marginTop: 2 }}>
                Presupuesto:{" "}
                <span style={{ color: cat.color, fontWeight: 700 }}>
                  {mxn(cat.budget)}
                </span>
                /mes
              </div>
            </div>
            <button
              onClick={() => openEdit(cat)}
              style={{
                background: C.elevated,
                border: `1px solid ${C.border}`,
                borderRadius: 10,
                padding: "7px 11px",
                color: C.sub,
                fontSize: 13,
                cursor: "pointer",
                flexShrink: 0,
              }}
            >
              ✏️
            </button>
          </div>
        ))}
        {categories.length === 0 && (
          <div style={{ textAlign: "center", paddingTop: 60, color: C.muted }}>
            <div style={{ fontSize: 40 }}>🏷️</div>
            <div style={{ marginTop: 10 }}>Sin categorías</div>
          </div>
        )}
      </div>

      <Modal
        open={showModal}
        onClose={() => setShowModal(false)}
        title={editing ? "Editar Categoría" : "Nueva Categoría"}
      >
        <Field label="Nombre">
          <Input
            value={form.name}
            onChange={(v) => setForm((f) => ({ ...f, name: v }))}
            placeholder="Ej. Transporte, Salud..."
          />
        </Field>
        <Field
          label="Presupuesto mensual (MXN)"
          hint="Cuánto puedes gastar aquí"
        >
          <Input
            value={form.budget}
            onChange={(v) => setForm((f) => ({ ...f, budget: v }))}
            placeholder="0.00"
            type="number"
          />
        </Field>
        <Field label="Ícono">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
            {CAT_ICONS.map((ic) => (
              <button
                key={ic}
                onClick={() => setForm((f) => ({ ...f, icon: ic }))}
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 10,
                  border: "none",
                  fontSize: 20,
                  cursor: "pointer",
                  background: form.icon === ic ? form.color + "44" : C.card,
                  outline:
                    form.icon === ic
                      ? `2px solid ${form.color}`
                      : `1px solid ${C.border}`,
                }}
              >
                {ic}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Color">
          <div
            style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 2 }}
          >
            {CAT_COLORS.map((col) => (
              <button
                key={col}
                onClick={() => setForm((f) => ({ ...f, color: col }))}
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 17,
                  background: col,
                  border: "none",
                  cursor: "pointer",
                  outline:
                    form.color === col
                      ? "3px solid #fff"
                      : "2px solid transparent",
                  outlineOffset: 2,
                  transition: "all .15s",
                }}
              />
            ))}
          </div>
        </Field>

        {/* Live preview */}
        <div
          style={{
            background: C.card,
            borderRadius: 12,
            padding: "11px 14px",
            border: `1px solid ${C.border}`,
            borderLeft: `3px solid ${form.color}`,
            marginBottom: 12,
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <span style={{ fontSize: 22 }}>{form.icon}</span>
          <div>
            <div style={{ fontSize: 13, fontWeight: 800, color: C.text }}>
              {form.name || "Nueva categoría"}
            </div>
            <div style={{ fontSize: 11, color: form.color, fontWeight: 700 }}>
              {form.budget ? mxn(parseFloat(form.budget) || 0) : mxn(0)}/mes
            </div>
          </div>
        </div>

        {editing && (
          <button
            onClick={deleteCat}
            style={{
              width: "100%",
              background: C.redDim,
              border: `1px solid ${C.red}44`,
              borderRadius: 12,
              padding: "11px 0",
              color: C.red,
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
              marginBottom: 8,
            }}
          >
            🗑 Eliminar categoría
          </button>
        )}
        <SaveBtn onClick={save} color={form.color}>
          {editing ? "Guardar Cambios" : "Crear Categoría"}
        </SaveBtn>
      </Modal>
    </div>
  );
}

// ─── TRANSFERS (received only — standalone tab removed, now lives in Dashboard) ──
// Transfer logic is handled directly inside Dashboard section

// ─── RESPONSIVE HOOK ─────────────────────────────────────────────────────────
function useBreakpoint() {
  const [w, setW] = useState(
    typeof window !== "undefined" ? window.innerWidth : 1280,
  );
  useEffect(() => {
    const fn = () => setW(window.innerWidth);
    window.addEventListener("resize", fn);
    return () => window.removeEventListener("resize", fn);
  }, []);
  return { isMobile: w < 768, isDesktop: w >= 1200, width: w };
}

// ─── SIDEBAR ─────────────────────────────────────────────────────────────────
const NAV_TABS = [
  { id: "dashboard", icon: "⊞", label: "Inicio" },
  { id: "expenses", icon: "🧾", label: "Gastos" },
  { id: "msi", icon: "🔄", label: "MSI" },
  { id: "goals", icon: "🎯", label: "Metas" },
  { id: "subs", icon: "📲", label: "Suscripciones" },
];

function Sidebar({ tab, setTab, userName, onLogout }) {
  return (
    <div
      style={{
        width: 220,
        flexShrink: 0,
        background: C.card,
        borderRight: `1px solid ${C.border}`,
        display: "flex",
        flexDirection: "column",
        padding: "24px 12px",
        gap: 4,
        position: "sticky",
        top: 0,
        height: "100vh",
        overflowY: "auto",
      }}
    >
      <div style={{ padding: "8px 12px 28px" }}>
        <div
          style={{
            fontSize: 22,
            fontWeight: 900,
            color: C.text,
            letterSpacing: -0.5,
          }}
        >
          💰 Finance
        </div>
        <div style={{ fontSize: 12, color: C.sub, marginTop: 2 }}>Tracker</div>
      </div>
      {NAV_TABS.map((t) => {
        const active = tab === t.id;
        return (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "10px 14px",
              borderRadius: 12,
              border: "none",
              background: active ? C.accentDim : "transparent",
              cursor: "pointer",
              width: "100%",
              textAlign: "left",
              transition: "background .15s",
              outline: active ? `1px solid ${C.accent}44` : "none",
            }}
          >
            <span style={{ fontSize: 18, lineHeight: 1 }}>{t.icon}</span>
            <span
              style={{
                fontSize: 14,
                fontWeight: active ? 700 : 500,
                color: active ? C.accent : C.sub,
              }}
            >
              {t.label}
            </span>
          </button>
        );
      })}
      <div
        style={{
          marginTop: "auto",
          padding: "12px 14px",
          borderTop: `1px solid ${C.border}`,
        }}
      >
        <div
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: C.text,
            marginBottom: 6,
          }}
        >
          {userName}
        </div>
        <button
          onClick={onLogout}
          style={{
            fontSize: 11,
            color: C.sub,
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: 0,
          }}
        >
          Cerrar sesión →
        </button>
      </div>
    </div>
  );
}

// ─── SPENDING MODAL ───────────────────────────────────────────────────────────
const fmtMonthKey = (mk) => {
  const [y, m] = mk.split("-");
  return new Date(+y, +m - 1, 1).toLocaleDateString("es-MX", { month: "long", year: "numeric" });
};

function SpendingModal({ expenses, categories, onClose }) {
  const months = useMemo(() => {
    const seen = new Set();
    expenses.forEach((e) => { if (!e.isMSIInstallment) seen.add(e.date.slice(0, 7)); });
    return [...seen].sort((a, b) => b.localeCompare(a));
  }, [expenses]);

  const [selectedMonth, setSelectedMonth] = useState(() => getCurrentMonth());

  const breakdown = useMemo(() => {
    return categories
      .map((cat) => ({
        ...cat,
        spent: expenses
          .filter((e) => !e.isMSIInstallment && e.date.startsWith(selectedMonth) && e.categoryId === cat.id)
          .reduce((s, e) => s + e.amount, 0),
      }))
      .filter((c) => c.spent > 0)
      .sort((a, b) => b.spent - a.spent);
  }, [expenses, categories, selectedMonth]);

  const total = breakdown.reduce((s, c) => s + c.spent, 0);

  // SVG donut chart
  const R = 52, stroke = 22;
  const circ = 2 * Math.PI * R;
  let acc = 0;
  const segments = breakdown.map((cat) => {
    const len = (cat.spent / total) * circ;
    const dashOffset = circ - acc;
    acc += len;
    return { ...cat, len, dashOffset };
  });

  return (
    <Modal open onClose={onClose} title="Gasto Mensual">
      {/* Month selector */}
      <select
        value={selectedMonth}
        onChange={(e) => setSelectedMonth(e.target.value)}
        style={{
          width: "100%", background: C.elevated, border: `1px solid ${C.border}`,
          borderRadius: 10, padding: "10px 12px", color: C.text, fontSize: 14,
          marginBottom: 20, cursor: "pointer", fontFamily: "inherit",
        }}
      >
        {months.map((m) => (
          <option key={m} value={m} style={{ background: C.elevated }}>
            {fmtMonthKey(m)}
          </option>
        ))}
      </select>

      {total > 0 ? (
        <>
          {/* Donut chart */}
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}>
            <svg width="180" height="180" viewBox="0 0 180 180">
              <g transform="rotate(-90 90 90)">
                {segments.map((seg) => (
                  <circle
                    key={seg.id}
                    cx="90" cy="90" r={R}
                    fill="none"
                    stroke={seg.color || C.accent}
                    strokeWidth={stroke}
                    strokeDasharray={`${seg.len} ${circ - seg.len}`}
                    strokeDashoffset={seg.dashOffset}
                    strokeLinecap="butt"
                  />
                ))}
              </g>
              {/* Center label */}
              <text x="90" y="84" textAnchor="middle" fill={C.text} fontSize="15" fontWeight="900" fontFamily="-apple-system,sans-serif">
                {mxn(total, true)}
              </text>
              <text x="90" y="101" textAnchor="middle" fill={C.sub} fontSize="10" fontFamily="-apple-system,sans-serif">
                total del mes
              </text>
            </svg>
          </div>

          {/* Category list */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {breakdown.map((cat) => {
              const pct = Math.round((cat.spent / total) * 100);
              return (
                <div key={cat.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{
                    width: 10, height: 10, borderRadius: "50%",
                    background: cat.color || C.accent, flexShrink: 0,
                  }} />
                  <span style={{ fontSize: 15, flexShrink: 0 }}>{cat.icon || "📦"}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{cat.name}</span>
                      <span style={{ fontSize: 13, fontWeight: 800, color: C.text, marginLeft: 8 }}>{mxn(cat.spent)}</span>
                    </div>
                    <div style={{ height: 4, background: C.border, borderRadius: 2, marginTop: 4, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${pct}%`, background: cat.color || C.accent, borderRadius: 2, transition: "width .3s" }} />
                    </div>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: C.sub, width: 30, textAlign: "right", flexShrink: 0 }}>{pct}%</span>
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <div style={{ textAlign: "center", padding: "32px 0", color: C.muted, fontSize: 13 }}>
          Sin gastos este mes
        </div>
      )}
    </Modal>
  );
}

// ─── AUTH SCREENS ─────────────────────────────────────────────────────────────
function AuthScreen({ onLogin }) {
  const [mode, setMode] = useState("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  const inputStyle = {
    background: C.elevated,
    border: `1px solid ${C.border}`,
    borderRadius: 12,
    padding: "13px 14px",
    color: C.text,
    fontSize: 14,
    width: "100%",
    outline: "none",
    marginBottom: 14,
  };
  const labelStyle = {
    fontSize: 11,
    fontWeight: 700,
    color: C.sub,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 6,
    display: "block",
  };

  const handleLogin = async () => {
    if (!email || !password) {
      setError("Completa todos los campos.");
      return;
    }
    setLoading(true);
    setError("");
    const { error: err } = await sb.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (err) setError("Email o contraseña incorrectos.");
    setLoading(false);
  };

  const handleRegister = async () => {
    if (!name || !email || !password || !confirm) {
      setError("Completa todos los campos.");
      return;
    }
    if (password.length < 6) {
      setError("Mínimo 6 caracteres.");
      return;
    }
    if (password !== confirm) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    setLoading(true);
    setError("");
    const { error: err } = await sb.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: { data: { full_name: name.trim() } },
    });
    if (err) setError(err.message);
    else
      setMsg(
        "✅ Cuenta creada. Revisa tu email para confirmar, luego inicia sesión.",
      );
    setLoading(false);
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: C.bg,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        fontFamily: "-apple-system,'SF Pro Display','Segoe UI',sans-serif",
      }}
    >
      <style>{`*{box-sizing:border-box;}body{margin:0;background:${C.bg};}input::placeholder{color:${C.muted};}`}</style>
      <div style={{ width: "100%", maxWidth: 400 }}>
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <div style={{ fontSize: 56, marginBottom: 12 }}>💰</div>
          <div
            style={{
              fontSize: 26,
              fontWeight: 900,
              color: C.text,
              letterSpacing: -0.5,
            }}
          >
            Finance Tracker
          </div>
          <div style={{ fontSize: 14, color: C.sub, marginTop: 4 }}>
            Tus finanzas, bajo control
          </div>
        </div>

        <div
          style={{
            background: C.card,
            borderRadius: 20,
            padding: 28,
            border: `1px solid ${C.border}`,
          }}
        >
          <div
            style={{
              fontSize: 18,
              fontWeight: 800,
              color: C.text,
              marginBottom: 20,
            }}
          >
            {mode === "login" ? "Iniciar Sesión" : "Crear Cuenta"}
          </div>

          {mode === "register" && (
            <>
              <label style={labelStyle}>Nombre</label>
              <input
                style={inputStyle}
                placeholder="Tu nombre"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
              />
            </>
          )}

          <label style={labelStyle}>Email</label>
          <input
            style={inputStyle}
            placeholder="tu@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            autoComplete="email"
          />

          <label style={labelStyle}>Contraseña</label>
          <input
            style={inputStyle}
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
          />

          {mode === "register" && (
            <>
              <label style={labelStyle}>Confirmar contraseña</label>
              <input
                style={inputStyle}
                placeholder="Repite la contraseña"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                type="password"
              />
            </>
          )}

          {error && (
            <div style={{ color: C.red, fontSize: 12, marginBottom: 12 }}>
              {error}
            </div>
          )}
          {msg && (
            <div style={{ color: C.green, fontSize: 12, marginBottom: 12 }}>
              {msg}
            </div>
          )}

          <button
            onClick={mode === "login" ? handleLogin : handleRegister}
            disabled={loading}
            style={{
              width: "100%",
              background: C.accent,
              border: "none",
              borderRadius: 12,
              padding: 15,
              color: "#fff",
              fontSize: 15,
              fontWeight: 800,
              cursor: "pointer",
              opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? "..." : mode === "login" ? "Entrar" : "Crear Cuenta"}
          </button>

          <div style={{ textAlign: "center", marginTop: 16 }}>
            <button
              onClick={() => {
                setMode(mode === "login" ? "register" : "login");
                setError("");
                setMsg("");
              }}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                fontSize: 13,
                color: C.sub,
              }}
            >
              {mode === "login" ? (
                <span>
                  ¿No tienes cuenta?{" "}
                  <span style={{ color: C.accent, fontWeight: 700 }}>
                    Crear una
                  </span>
                </span>
              ) : (
                <span>
                  ¿Ya tienes cuenta?{" "}
                  <span style={{ color: C.accent, fontWeight: 700 }}>
                    Iniciar sesión
                  </span>
                </span>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const { isDesktop } = useBreakpoint();
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [tab, setTab] = useState("dashboard");
  const [accounts, setAccounts] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [categories, setCategories] = useState([]);
  const [goals, setGoals] = useState([]);
  const [plans, setPlans] = useState([]);
  const [subs, setSubs] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const [goalWithdrawals, setGoalWithdrawals] = useState([]);
  const [dataLoading, setDataLoading] = useState(false);
  const [showSpendingModal, setShowSpendingModal] = useState(false);

  useEffect(() => {
    sb.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setAuthLoading(false);
    });
    const {
      data: { subscription },
    } = sb.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      setAuthLoading(false);
    });
    return () => subscription.unsubscribe();
  }, []);

  const loadAll = useCallback(async () => {
    if (!session) return;
    setDataLoading(true);
    const [accR, catR, expR, gR, msiR, subR, trR, gwR] = await Promise.all([
      sb.from("accounts").select("*").order("name"),
      sb.from("categories").select("*").order("name"),
      sb.from("expenses").select("*").order("date", { ascending: false }),
      sb.from("goals").select("*").order("name"),
      sb
        .from("msi_plans")
        .select("*")
        .order("created_at", { ascending: false }),
      sb.from("subscriptions").select("*").eq("active", true).order("name"),
      sb.from("transfers").select("*").order("date", { ascending: false }),
      sb
        .from("goal_withdrawals")
        .select("*")
        .order("date", { ascending: false }),
    ]);
    setAccounts(
      (accR.data || []).map((a) => ({
        id: a.id,
        name: a.name,
        type: a.type,
        balance: Number(a.balance),
        limit: a.credit_limit ? Number(a.credit_limit) : null,
        color: a.color,
        cutDay: a.cut_day,
        payDay: a.pay_day,
      })),
    );
    setCategories(
      (catR.data || []).map((c) => ({
        id: c.id,
        name: c.name,
        icon: c.icon,
        color: c.color,
        budget: Number(c.budget),
      })),
    );
    setExpenses(
      (expR.data || []).map((e) => ({
        id: e.id,
        description: e.description,
        amount: Number(e.amount),
        date: e.date,
        accountId: e.account_id,
        categoryId: e.category_id,
        paymentDate: e.payment_date,
        isMSI: e.is_msi,
        msiPlanId: e.msi_plan_id,
        msiIndex: e.msi_index,
        msiTotal: e.msi_total,
        isTdcPayment: e.is_tdc_payment,
        isSubscription: e.is_subscription,
        linkedGoalId: e.linked_goal_id,
        isMSIInstallment: e.is_msi,
      })),
    );
    setGoals(
      (gR.data || []).map((g) => ({
        id: g.id,
        name: g.name,
        target: Number(g.target_amount),
        current: Number(g.current_amount),
        icon: g.icon,
        color: g.color,
      })),
    );
    setPlans(
      (msiR.data || []).map((p) => ({
        id: p.id,
        desc: p.description,
        total: Number(p.total_amount),
        monthly: Number(p.monthly_payment),
        totalM: p.total_months,
        paidM: p.paid_months,
        accountId: p.account_id,
        startDate: p.start_date,
      })),
    );
    setSubs(
      (subR.data || []).map((s) => ({
        id: s.id,
        name: s.name,
        amount: Number(s.amount),
        frequency: s.frequency,
        categoryId: s.category_id,
        accountId: s.account_id,
        chargeDay: s.charge_day,
        active: s.active,
        color: "#7C6FFF",
      })),
    );
    setTransfers(
      (trR.data || []).map((t) => ({
        id: t.id,
        type: t.type,
        amount: Number(t.amount),
        accountId: t.account_id,
        counterparty: t.counterparty,
        date: t.date,
        notes: t.notes,
      })),
    );
    if (gwR.error) console.error("goal_withdrawals fetch error:", gwR.error);
    setGoalWithdrawals(
      (gwR.data || []).map((w) => ({
        id: w.id,
        goalId: w.goal_id,
        accountId: w.account_id,
        amount: Number(w.amount),
        date: w.date,
        concept: w.concept || null,
      })),
    );
    setDataLoading(false);
  }, [session]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const addAccount = async (data) => {
    const { data: row } = await sb
      .from("accounts")
      .insert({
        user_id: session.user.id,
        name: data.name,
        type: data.type,
        balance: data.balance ?? 0,
        credit_limit: data.limit ?? null,
        color: data.color,
        cut_day: data.cutDay ?? null,
        pay_day: data.payDay ?? null,
      })
      .select()
      .single();
    if (row)
      setAccounts((p) => [
        ...p,
        {
          id: row.id,
          name: row.name,
          type: row.type,
          balance: Number(row.balance),
          limit: row.credit_limit ? Number(row.credit_limit) : null,
          color: row.color,
          cutDay: row.cut_day,
          payDay: row.pay_day,
        },
      ]);
  };
  const updateAccount = async (updated) => {
    await sb
      .from("accounts")
      .update({
        name: updated.name,
        type: updated.type,
        balance: updated.balance,
        credit_limit: updated.limit ?? null,
        color: updated.color,
        cut_day: updated.cutDay ?? null,
        pay_day: updated.payDay ?? null,
      })
      .eq("id", updated.id);
    setAccounts((p) => p.map((a) => (a.id === updated.id ? updated : a)));
  };
  const deleteAccount = async (id) => {
    await sb.from("accounts").delete().eq("id", id);
    setAccounts((p) => p.filter((a) => a.id !== id));
  };
  const handleLogout = async () => {
    await sb.auth.signOut();
    setAccounts([]);
    setExpenses([]);
    setCategories([]);
    setGoals([]);
    setPlans([]);
    setSubs([]);
    setTransfers([]);
  };

  if (authLoading)
    return (
      <div
        style={{
          minHeight: "100vh",
          background: C.bg,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div style={{ color: C.accent, fontSize: 32 }}>💰</div>
      </div>
    );
  if (!session) return <AuthScreen />;

  const userName =
    session.user.user_metadata?.full_name ||
    session.user.email?.split("@")[0] ||
    "Usuario";

  const screen = (
    <>
      {tab === "dashboard" && (
        <Dashboard
          expenses={expenses}
          accounts={accounts}
          setAccounts={setAccounts}
          categories={categories}
          setCategories={setCategories}
          transfers={transfers}
          setTransfers={setTransfers}
          goalWithdrawals={goalWithdrawals}
          goals={goals}
          onAddAccount={addAccount}
          onUpdateAccount={updateAccount}
          onDeleteAccount={deleteAccount}
          session={session}
          reloadAll={loadAll}
        />
      )}
      {tab === "expenses" && (
        <Expenses
          expenses={expenses}
          setExpenses={setExpenses}
          accounts={accounts}
          setAccounts={setAccounts}
          subs={subs}
          plans={plans}
          setPlans={setPlans}
          categories={categories}
          goals={goals}
          setGoals={setGoals}
          transfers={transfers}
          goalWithdrawals={goalWithdrawals}
          session={session}
          reloadAll={loadAll}
        />
      )}
      {tab === "msi" && (
        <MSI
          plans={plans}
          setPlans={setPlans}
          accounts={accounts}
          session={session}
          reloadAll={loadAll}
        />
      )}
      {tab === "goals" && (
        <Goals
          goals={goals}
          setGoals={setGoals}
          accounts={accounts}
          setAccounts={setAccounts}
          goalWithdrawals={goalWithdrawals}
          session={session}
          reloadAll={loadAll}
        />
      )}
      {tab === "subs" && (
        <Subscriptions
          subs={subs}
          setSubs={setSubs}
          accounts={accounts}
          expenses={expenses}
          setExpenses={setExpenses}
          categories={categories}
          session={session}
          reloadAll={loadAll}
        />
      )}
    </>
  );

  const globalStyles = `*{box-sizing:border-box;-webkit-tap-highlight-color:transparent;}body{margin:0;background:${C.bg};}input::placeholder{color:${C.muted};}input{caret-color:${C.accent};}input[type=date]{color-scheme:dark;}@keyframes slideUp{from{transform:translateY(100%);opacity:0;}to{transform:translateY(0);opacity:1;}}`;

  if (isDesktop)
    return (
      <div
        style={{
          display: "flex",
          minHeight: "100vh",
          background: C.bg,
          fontFamily: "-apple-system,'SF Pro Display','Segoe UI',sans-serif",
        }}
      >
        <style>
          {globalStyles +
            `::-webkit-scrollbar{width:6px;}::-webkit-scrollbar-track{background:${C.bg};}::-webkit-scrollbar-thumb{background:${C.border};border-radius:3px;}`}
        </style>
        <Sidebar
          tab={tab}
          setTab={setTab}
          userName={userName}
          onLogout={handleLogout}
        />
        <div
          style={{
            flex: 1,
            display: "flex",
            justifyContent: "center",
            overflowY: "auto",
            minHeight: "100vh",
          }}
        >
          <div style={{ width: "100%", maxWidth: 920, padding: "32px 40px" }}>
            {dataLoading ? (
              <div
                style={{ color: C.sub, textAlign: "center", paddingTop: 80 }}
              >
                Cargando datos...
              </div>
            ) : (
              screen
            )}
            <div style={{ height: 40 }} />
          </div>
        </div>
      </div>
    );

  return (
    <div
      style={{
        background: C.bg,
        minHeight: "100vh",
        maxWidth: 480,
        margin: "0 auto",
        position: "relative",
        fontFamily: "-apple-system,'SF Pro Display','Segoe UI',sans-serif",
      }}
    >
      <style>{globalStyles + `::-webkit-scrollbar{display:none;}`}</style>
      <div
        style={{ height: "env(safe-area-inset-top, 44px)", background: C.bg }}
      />
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "6px 16px 0",
          background: C.bg,
        }}
      >
        <button
          onClick={() => setShowSpendingModal(true)}
          style={{
            background: "none", border: "none", cursor: "pointer",
            fontSize: 20, padding: "3px 4px", lineHeight: 1,
          }}
          title="Gasto Mensual"
        >
          📊
        </button>
        <button
          onClick={handleLogout}
          style={{
            background: "none", border: "none", color: C.sub,
            fontSize: 11, cursor: "pointer", padding: "3px 8px", fontFamily: "inherit",
          }}
        >
          Cerrar sesión →
        </button>
      </div>
      {showSpendingModal && (
        <SpendingModal
          expenses={expenses}
          categories={categories}
          onClose={() => setShowSpendingModal(false)}
        />
      )}
      <div
        style={{
          paddingBottom: "calc(85px + env(safe-area-inset-bottom, 0px))",
        }}
      >
        {dataLoading ? (
          <div style={{ color: C.sub, textAlign: "center", paddingTop: 80 }}>
            Cargando datos...
          </div>
        ) : (
          screen
        )}
      </div>
      <div
        style={{
          position: "fixed",
          bottom: 0,
          left: "50%",
          transform: "translateX(-50%)",
          width: "100%",
          maxWidth: 480,
          background: C.card,
          borderTop: `1px solid ${C.border}`,
          display: "flex",
          padding: "8px 4px 0",
          paddingBottom: "calc(16px + env(safe-area-inset-bottom, 0px))",
          zIndex: 100,
          backdropFilter: "blur(20px)",
        }}
      >
        {NAV_TABS.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 3,
                padding: "5px 2px",
                background: "none",
                border: "none",
                cursor: "pointer",
                borderRadius: 12,
              }}
            >
              <div
                style={{
                  padding: "3px 12px",
                  borderRadius: 9,
                  background: active ? C.accentDim : "transparent",
                  transition: "background .2s",
                }}
              >
                <span style={{ fontSize: 20, lineHeight: 1 }}>{t.icon}</span>
              </div>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: active ? 800 : 500,
                  color: active ? C.accent : C.muted,
                  transition: "color .2s",
                }}
              >
                {t.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
