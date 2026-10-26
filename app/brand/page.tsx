"use client";

// Brand Manager: the business tenant's hub for its brand assets — company
// profile, logo registry, and merch inventory/ordering. NOT a platform-operator
// console; it belongs to the org whose brand it manages.
// BrandRepo uses Supabase when configured and localStorage only as a local
// development fallback; this page keeps data access client-side in both modes.

import { useEffect, useState } from "react";
import {
  repo,
  type Company,
  type InventoryItem,
  type LogoRole,
  type Order,
  type StoredLogo,
} from "@/lib/store";
import { SERVICE_NAME } from "@/lib/config";
import { hasSupabase, listMyOrgs, type Organization } from "@/lib/org";
import CompanyCard from "@/components/brand/CompanyCard";
import LogoSection from "@/components/brand/LogoSection";
import OrgSection from "@/components/brand/OrgSection";
import HandleCard from "@/components/brand/HandleCard";
import InventorySection from "@/components/brand/InventorySection";
import AppHeader from "@/components/AppHeader";

const yen = new Intl.NumberFormat("ja-JP");

function sortOrders(orders: Order[]): Order[] {
  return [...orders].sort((a, b) => b.orderedAt.localeCompare(a.orderedAt));
}

export default function AdminPage() {
  const [company, setCompany] = useState<Company | null>(null);
  const [logos, setLogos] = useState<StoredLogo[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [org, setOrg] = useState<Organization | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      repo.getCompany(),
      repo.listLogos(),
      repo.listInventory(),
      repo.listOrders(),
      // The primary org (first joined) backs the company profile and members.
      hasSupabase ? listMyOrgs().then((os) => os[0] ?? null) : Promise.resolve(null),
    ]).then(([c, l, inv, o, primaryOrg]) => {
      if (cancelled) return;
      setCompany(c);
      setLogos(l);
      setInventory(inv);
      setOrders(sortOrders(o));
      setOrg(primaryOrg);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSaveCompany = async (c: Company) => {
    await repo.saveCompany(c);
    setCompany(c);
  };

  const handleChangeRole = async (id: string, role: LogoRole) => {
    await repo.updateLogo(id, { role });
    setLogos(await repo.listLogos());
  };

  const handleDelete = async (id: string) => {
    const title = logos.find((l) => l.id === id)?.title ?? "";
    if (!window.confirm(`「${title}」を削除しますか？この操作は取り消せません。`)) {
      return;
    }
    await repo.deleteLogo(id);
    setLogos(await repo.listLogos());
  };

  const handleOrder = async (itemId: string, qty: number) => {
    await repo.placeOrder(itemId, qty);
    const [inv, o] = await Promise.all([repo.listInventory(), repo.listOrders()]);
    setInventory(inv);
    setOrders(sortOrders(o));
  };

  if (loading || !company) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[#F7F7F8] text-[#111827]">
        <p className="text-sm text-gray-500">読み込み中…</p>
      </div>
    );
  }

  const reorderCount = inventory.filter((i) => i.stock < i.parLevel * 0.3).length;
  const pendingOrders = orders.filter((o) => o.status === "ordered");
  const pendingAmount = pendingOrders.reduce((sum, o) => sum + o.amount, 0);

  return (
    <div className="min-h-dvh bg-[#F7F7F8] text-[#111827]">
      <AppHeader section="Brand Manager" />

      <div className="mx-auto flex max-w-6xl flex-col gap-10 px-6 py-8">
        <div>
          <h1 className="text-balance text-lg font-semibold">
            {SERVICE_NAME}®{" "}
            <span className="text-xs font-normal text-gray-500">Brand Manager</span>
          </h1>
        </div>

        {/* KPI row */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <p className="text-xs text-gray-500">登録アセット数</p>
            <p className="mt-1 text-3xl font-semibold tabular-nums">{logos.length}</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <p className="text-xs text-gray-500">在庫アイテム数</p>
            <p className="mt-1 text-3xl font-semibold tabular-nums">{inventory.length}</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <p className="text-xs text-gray-500">要発注アイテム数</p>
            <p
              className={`mt-1 text-3xl font-semibold tabular-nums ${
                reorderCount > 0 ? "text-red-600" : ""
              }`}
            >
              {reorderCount}
            </p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <p className="text-xs text-gray-500">入荷待ち発注</p>
            <p className="mt-1 text-3xl font-semibold tabular-nums">
              {pendingOrders.length}
              <span className="ml-2 text-sm font-normal text-gray-500 tabular-nums">
                ¥{yen.format(pendingAmount)}
              </span>
            </p>
          </div>
        </div>

        {/* Access-management workspace. Brands themselves live in brand
            management (/brands). */}
        <section className="flex flex-col gap-3">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">管理ワークスペース</h2>
            <p className="text-pretty text-xs text-gray-500">
              メンバー、権限、所有、在庫を管理する単位です。会社・事業のブランド情報は「あなたのブランド」で管理します。
            </p>
          </div>
          <CompanyCard
            company={company}
            onSave={handleSaveCompany}
          />
        </section>

        {/* Members & roles (Supabase mode) */}
        {org && (
          <section className="flex flex-col gap-3">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">メンバーと権限</h2>
              <p className="text-pretty text-xs text-gray-500">
                組織のメンバーを招待し、役割(編集・購買・閲覧など)を割り当てます。
              </p>
            </div>
            <OrgSection org={org} />
          </section>
        )}

        {/* Vanity URL handle (Supabase mode) */}
        {org && (
          <section className="flex flex-col gap-3">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">公開URL（ハンドル）</h2>
              <p className="text-pretty text-xs text-gray-500">
                組織のハンドルを設定すると、公開ロゴを /ハンドル/スラッグ の短いURLで共有できます。
              </p>
            </div>
            <HandleCard org={org} />
          </section>
        )}

        {/* Logos */}
        <section className="flex flex-col gap-3">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">登録アセット</h2>
            <p className="text-pretty text-xs text-gray-500">
              アップロード済みのロゴアセットの役割設定と管理を行います。
            </p>
          </div>
          <LogoSection
            logos={logos}
            onChangeRole={handleChangeRole}
            onDelete={handleDelete}
          />
        </section>

        {/* Inventory */}
        <section className="flex flex-col gap-3">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">ロゴアイテム在庫</h2>
            <p className="text-pretty text-xs text-gray-500">
              ロゴ入りアイテムの在庫状況の確認と発注を行います。
            </p>
          </div>
          <InventorySection items={inventory} orders={orders} onOrder={handleOrder} />
        </section>
      </div>
    </div>
  );
}
