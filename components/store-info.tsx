"use client";
// Store contact details for the store page and the store list. Everything shown comes from the
// store record (`Store.contacts`); missing fields are simply left out.
import {
  ArrowUpRight,
  AtSign,
  Clock,
  Globe,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  Send,
  Star,
  Users,
} from "lucide-react";
import type { ReactNode } from "react";
import type { Store, StoreContacts } from "../lib/catalog";
import { storeIsPremium } from "../lib/plans";

const handle = (v: string) => v.trim().replace(/^@/, "");
const url = (v: string, base: string) =>
  /^https?:\/\//i.test(v.trim()) ? v.trim() : base + handle(v);
const safeHttp = (v: string) => (/^https?:\/\//i.test(v) ? v : "");
export const telHref = (phone: string) => "tel:" + phone.replace(/[^\d+]/g, "");
export const whatsappHref = (v: string) =>
  /^https?:\/\//i.test(v.trim()) ? v.trim() : "https://wa.me/" + v.replace(/\D/g, "");

export const isPremium = (s: Store) => storeIsPremium(s as Store & { planUntil?: string });

export function PremiumBadge() {
  return (
    <span className="premium-badge" title="Premium mağaza: qiymət sırasına təsir etmir">
      <Star size={12} aria-hidden="true" /> Premium
    </span>
  );
}

type Row = { key: string; icon: ReactNode; label: string; content: ReactNode };

function rows(c: StoreContacts, domain?: string): Row[] {
  const out: Row[] = [];
  const ext = { target: "_blank", rel: "noopener noreferrer" } as const;
  if (c.phones?.length)
    out.push({
      key: "phones",
      icon: <Phone size={16} />,
      label: "Telefon",
      content: c.phones.map((p, i) => (
        <span key={p}>
          {i > 0 && ", "}
          <a href={telHref(p)}>{p}</a>
        </span>
      )),
    });
  if (c.email)
    out.push({
      key: "email",
      icon: <Mail size={16} />,
      label: "E-poçt",
      content: <a href={"mailto:" + c.email}>{c.email}</a>,
    });
  if (c.address || c.city)
    out.push({
      key: "address",
      icon: <MapPin size={16} />,
      label: "Ünvan",
      content: [c.address, c.city].filter(Boolean).join(", "),
    });
  if (c.hours)
    out.push({ key: "hours", icon: <Clock size={16} />, label: "İş saatları", content: c.hours });
  if (domain)
    out.push({
      key: "site",
      icon: <Globe size={16} />,
      label: "Sayt",
      content: (
        <a href={"https://" + domain} {...ext}>
          {domain} <ArrowUpRight size={13} aria-hidden="true" />
        </a>
      ),
    });
  return out;
}

type Social = { key: string; label: string; href: string; icon: ReactNode };
function socials(c: StoreContacts): Social[] {
  const list: (Social | false | "" | undefined)[] = [
    c.whatsapp && {
      key: "whatsapp",
      label: "WhatsApp",
      href: whatsappHref(c.whatsapp),
      icon: <MessageCircle size={16} />,
    },
    c.instagram && {
      key: "instagram",
      label: "Instagram",
      href: url(c.instagram, "https://instagram.com/"),
      icon: <AtSign size={16} />,
    },
    c.facebook && {
      key: "facebook",
      label: "Facebook",
      href: url(c.facebook, "https://facebook.com/"),
      icon: <Users size={16} />,
    },
    c.telegram && {
      key: "telegram",
      label: "Telegram",
      href: url(c.telegram, "https://t.me/"),
      icon: <Send size={16} />,
    },
  ];
  return list.filter((x): x is Social => !!x && !!safeHttp(x.href));
}

// Full contact list for the store page.
export function StoreContactList({ store }: { store: Store }) {
  const c = store.contacts || {};
  const list = rows(c, store.domain);
  const social = socials(c);
  if (!list.length && !social.length) return null;
  return (
    <div className="store-contacts">
      <dl>
        {list.map((r) => (
          <div key={r.key}>
            <dt>
              {r.icon}
              <span>{r.label}</span>
            </dt>
            <dd>{r.content}</dd>
          </div>
        ))}
      </dl>
      {social.length > 0 && (
        <div className="store-social" aria-label="Sosial şəbəkələr">
          {social.map((s) => (
            <a key={s.key} href={s.href} target="_blank" rel="noopener noreferrer">
              {s.icon}
              {s.label}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

// One or two lines for a store card: first phone and city/hours.
export function StoreContactSummary({ store }: { store: Store }) {
  const c = store.contacts;
  if (!c) return null;
  const phone = c.phones?.[0];
  const where = c.city || c.address;
  if (!phone && !where && !c.hours) return null;
  return (
    <ul className="store-card-contacts">
      {phone && (
        <li>
          <Phone size={14} aria-hidden="true" />
          <a href={telHref(phone)}>{phone}</a>
        </li>
      )}
      {where && (
        <li>
          <MapPin size={14} aria-hidden="true" />
          {where}
        </li>
      )}
      {c.hours && (
        <li>
          <Clock size={14} aria-hidden="true" />
          {c.hours}
        </li>
      )}
    </ul>
  );
}
