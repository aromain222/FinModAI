import { NextResponse } from "next/server";
import {
  getSavedProductIds,
  listSavedProducts,
  removeSavedProduct,
  toggleSavedProduct
} from "@/lib/storage/saved-store";

export async function GET() {
  return NextResponse.json({
    savedIds: getSavedProductIds(),
    items: listSavedProducts()
  });
}

export async function POST(request: Request) {
  const body = (await request.json()) as { productId?: string };

  if (!body.productId) {
    return NextResponse.json({ error: "productId is required." }, { status: 400 });
  }

  return NextResponse.json(toggleSavedProduct(body.productId));
}

export async function DELETE(request: Request) {
  const body = (await request.json()) as { productId?: string };

  if (!body.productId) {
    return NextResponse.json({ error: "productId is required." }, { status: 400 });
  }

  return NextResponse.json(removeSavedProduct(body.productId));
}
