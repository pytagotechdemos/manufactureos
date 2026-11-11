import "dotenv/config";
import Decimal from "decimal.js";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "../src/lib/prisma";
import { seedAccessControl } from "./seed-access-control";
import { hashPassword } from "better-auth/crypto";

const D = (value: string | number) => new Prisma.Decimal(new Decimal(value).toString());

async function main() {
  console.log("🌱 Starting Cafe & Coffee Roastery ERP Seeder (200+ Items)...");

  // 1. Ensure access control and admin user exist
  await seedAccessControl(prisma);

  const adminEmail = "admin@manufactureos.local";
  const adminPassword = "ManufactureOS2026!";
  const hashed = await hashPassword(adminPassword);

  const adminUser = await prisma.user.upsert({
    where: { email: adminEmail },
    update: { role: "admin", status: "ACTIVE", emailVerified: true, banned: false },
    create: {
      name: "Super Administrator",
      email: adminEmail,
      emailVerified: true,
      status: "ACTIVE",
      role: "admin",
      banned: false,
    },
  });

  const existingAccount = await prisma.account.findFirst({
    where: { userId: adminUser.id, providerId: "credential" },
  });
  if (existingAccount) {
    await prisma.account.update({
      where: { id: existingAccount.id },
      data: { password: hashed, updatedAt: new Date() },
    });
  } else {
    await prisma.account.create({
      data: {
        accountId: adminUser.id,
        providerId: "credential",
        userId: adminUser.id,
        password: hashed,
      },
    });
  }

  // 2. Clean up operational and test tables with TRUNCATE CASCADE
  console.log("🧹 Truncating existing test & operational data...");
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      "StockReservation",
      "StockMovement",
      "StockBalance",
      "ProductionReceipt",
      "ManufacturingCostSnapshot",
      "QcInspection",
      "WorkOrderTimeEntry",
      "WorkOrder",
      "ManufacturingOrderMaterial",
      "ManufacturingOrder",
      "MrpRecommendationSource",
      "MrpRecommendation",
      "MrpBucket",
      "MrpRun",
      "ProductionDemandLine",
      "ProductionDemand",
      "GoodsReceiptLine",
      "GoodsReceipt",
      "PurchaseRequestAllocation",
      "PurchaseOrderLine",
      "PurchaseOrder",
      "PurchaseRequestLine",
      "PurchaseRequest",
      "BomLine",
      "Bom",
      "UomConversion",
      "Item",
      "ItemCategory",
      "UnitOfMeasure",
      "Supplier",
      "Warehouse",
      "WorkCenter",
      "audit_logs"
    CASCADE;
  `);

  console.log("📦 Creating Units of Measure (UOMs)...");
  // 3. Units of Measure
  const uomsData = [
    { code: "KG", name: "Kilogram", dimension: "MASS", precision: 3 },
    { code: "GR", name: "Gram", dimension: "MASS", precision: 2 },
    { code: "L", name: "Liter", dimension: "VOLUME", precision: 3 },
    { code: "ML", name: "Mililiter", dimension: "VOLUME", precision: 1 },
    { code: "PCS", name: "Pieces", dimension: "COUNT", precision: 0 },
    { code: "BOX", name: "Box", dimension: "COUNT", precision: 0 },
    { code: "PACK", name: "Pack", dimension: "COUNT", precision: 0 },
    { code: "CAN", name: "Kaleng", dimension: "COUNT", precision: 0 },
    { code: "BTL", name: "Botol", dimension: "COUNT", precision: 0 },
    { code: "ROLL", name: "Roll", dimension: "COUNT", precision: 0 },
    { code: "M", name: "Meter", dimension: "LENGTH", precision: 2 },
  ];

  const uomMap = new Map<string, string>();
  for (const u of uomsData) {
    const created = await prisma.unitOfMeasure.create({ data: u });
    uomMap.set(u.code, created.id);
  }

  // 4. UOM Conversions
  console.log("🔄 Creating UOM Conversions...");
  await prisma.uomConversion.createMany({
    data: [
      { fromUomId: uomMap.get("KG")!, toUomId: uomMap.get("GR")!, factor: D("1000") },
      { fromUomId: uomMap.get("L")!, toUomId: uomMap.get("ML")!, factor: D("1000") },
      { fromUomId: uomMap.get("BOX")!, toUomId: uomMap.get("PCS")!, factor: D("5") },
      { fromUomId: uomMap.get("PACK")!, toUomId: uomMap.get("PCS")!, factor: D("50") },
    ],
  });

  // 5. Item Categories
  console.log("🏷️ Creating Item Categories...");
  const categoriesData = [
    { code: "COFFEE_GREEN", name: "Biji Kopi Mentah (Green Beans)" },
    { code: "DAIRY_MILK", name: "Susu Segar & Plant-Based Milk" },
    { code: "SYRUP_SWEETENER", name: "Sirup, Saus & Pemanis Alami" },
    { code: "BEVERAGE_POWDER", name: "Bubuk Minuman, Cokelat & Perisa" },
    { code: "TEA_BOTANICAL", name: "Teh Daun & Bahan Herbal Botani" },
    { code: "BAKERY_FLOUR", name: "Tepung & Bahan Pokok Pastry" },
    { code: "BAKERY_FAT_DAIRY", name: "Mentega, Keju & Telur Segar" },
    { code: "CHOCOLATE_FRUIT", name: "Cokelat Couverture, Kacang & Buah" },
    { code: "PACKAGING_CUP", name: "Gelas, Botol Kaca & Kaleng Minuman" },
    { code: "PACKAGING_LID", name: "Tutup Gelas, Sedotan & Segel" },
    { code: "PACKAGING_BOX", name: "Kotak Pastry, Pouch Kopi & Tas Kertas" },
    { code: "PACKAGING_LABEL", name: "Label Stiker & Pita Kemasan" },
    { code: "SUB_COFFEE", name: "Kopi Sangrai (Roasted Coffee Blends)" },
    { code: "SUB_EXTRACT", name: "Konsentrat Ekstrak Kopi & Saus" },
    { code: "SUB_DOUGH", name: "Adonan Pastry, Kukis & Krim Isian" },
    { code: "FG_BEVERAGE", name: "Minuman Botol & Kaleng Siap Saji (RTD)" },
    { code: "FG_RETAIL_COFFEE", name: "Kopi Retail Pouch & Drip Bag Box" },
    { code: "FG_BAKERY_PASTRY", name: "Fresh Bakery, Croissant & Cake" },
    { code: "CONSUMABLE_CAFE", name: "Bahan Pembersih & Sanitasi Barista" },
  ];

  const catMap = new Map<string, string>();
  for (const c of categoriesData) {
    const created = await prisma.itemCategory.create({ data: c });
    catMap.set(c.code, created.id);
  }

  // 6. Suppliers
  console.log("🏢 Creating Cafe Suppliers...");
  const suppliersData = [
    {
      code: "SUP-GAYO",
      name: "Koperasi Petani Kopi Gayo Highland",
      email: "order@gayohighlandcoffee.co.id",
      phone: "+62 643 21980",
      address: "Jl. Takengon - Bireuen Km 12, Aceh Tengah",
    },
    {
      code: "SUP-DAIRY",
      name: "PT Nusantara Dairy Sejahtera",
      email: "sales@nusantaradairy.co.id",
      phone: "+62 22 780 1234",
      address: "Kawasan Industri Peternakan Lembang, Bandung Barat",
    },
    {
      code: "SUP-SYRUP",
      name: "PT Sirup Alami & Pemanis Tropis",
      email: "supply@tropicsyrup.com",
      phone: "+62 251 832 9900",
      address: "Jl. Pajajaran No. 88, Bogor, Jawa Barat",
    },
    {
      code: "SUP-PACK",
      name: "PT Kemasan Prima Cemerlang",
      email: "b2b@primapackaging.co.id",
      phone: "+62 21 5596 4433",
      address: "Kawasan Industri Manis, Curug, Tangerang",
    },
    {
      code: "SUP-BAKE",
      name: "PT Mitra Bahan Roti & Kue Sejahtera",
      email: "orders@mitrabahankue.id",
      phone: "+62 21 690 5588",
      address: "Jl. Daan Mogot Km 14, Cengkareng, Jakarta Barat",
    },
  ];

  for (const s of suppliersData) {
    await prisma.supplier.create({ data: s });
  }

  // 7. Warehouses
  console.log("🏬 Creating Warehouses...");
  const whRaw = await prisma.warehouse.create({
    data: {
      code: "WH-RAW",
      name: "Central Raw Material & Cold Storage",
      description: "Penyimpanan bahan baku kering, chiller susu segar & kemasan",
      isWip: false,
    },
  });

  await prisma.warehouse.create({
    data: {
      code: "WH-WIP",
      name: "Kitchen & Roastery Floor (WIP)",
      description: "Lantai produksi sangrai kopi, ekstraksi minuman & dapur pastry",
      isWip: true,
    },
  });

  const whFg = await prisma.warehouse.create({
    data: {
      code: "WH-FG",
      name: "Finished Goods & Dispatch Outlet",
      description: "Gudang produk siap jual, display pastry & cold display RTD",
      isWip: false,
    },
  });

  // 8. Work Centers
  console.log("⚙️ Creating Work Centers...");
  await prisma.workCenter.create({
    data: {
      code: "WC-ROAST",
      name: "Coffee Roastery Drum Station",
      hourlyRate: D("150000"),
      standardMinutes: D("480"),
    },
  });

  await prisma.workCenter.create({
    data: {
      code: "WC-BREW",
      name: "Extraction & Beverage Blending Bar",
      hourlyRate: D("90000"),
      standardMinutes: D("480"),
    },
  });

  await prisma.workCenter.create({
    data: {
      code: "WC-PACK",
      name: "Bottling, Seaming & Packaging Line",
      hourlyRate: D("80000"),
      standardMinutes: D("480"),
    },
  });

  await prisma.workCenter.create({
    data: {
      code: "WC-BAKE",
      name: "Bakery Proofing & Deck Oven Station",
      hourlyRate: D("120000"),
      standardMinutes: D("480"),
    },
  });

  console.log("☕ Seeding 200+ Cafe Items...");
  // 9. Items Definition (240+ Items)
  type ItemSeed = {
    sku: string;
    name: string;
    description: string;
    cat: string;
    type: "RAW_MATERIAL" | "PURCHASED_COMPONENT" | "SUB_ASSEMBLY" | "FINISHED_GOODS" | "CONSUMABLE";
    supply: "BUY" | "MAKE";
    uom: string;
    cost: string;
    rop: string;
    safety: string;
    leadDays: number;
    moq: string;
    lotSize: string;
    initialStock?: string;
    initialWh?: "RAW" | "FG";
  };

  const itemsList: ItemSeed[] = [
    // ── RAW MATERIALS: Biji Kopi Mentah (Green Beans) (16 items) ──
    { sku: "RM-GRN-GAYO", name: "Biji Kopi Mentah Arabica Gayo Washed", description: "Green coffee bean varietas Tim-Tim & Bourbon, altitude 1500m", cat: "COFFEE_GREEN", type: "RAW_MATERIAL", supply: "BUY", uom: "KG", cost: "115000", rop: "100", safety: "30", leadDays: 5, moq: "60", lotSize: "30", initialStock: "350", initialWh: "RAW" },
    { sku: "RM-GRN-MAND", name: "Biji Kopi Mentah Arabica Mandheling Semi-Washed", description: "Green bean body tebal, earthy khas Danau Toba", cat: "COFFEE_GREEN", type: "RAW_MATERIAL", supply: "BUY", uom: "KG", cost: "120000", rop: "80", safety: "20", leadDays: 7, moq: "60", lotSize: "30", initialStock: "200", initialWh: "RAW" },
    { sku: "RM-GRN-TORJ", name: "Biji Kopi Mentah Arabica Toraja Sapan Natural", description: "Grade 1 Sapan Tana Toraja, fruity note dark cherry", cat: "COFFEE_GREEN", type: "RAW_MATERIAL", supply: "BUY", uom: "KG", cost: "135000", rop: "50", safety: "15", leadDays: 7, moq: "30", lotSize: "15", initialStock: "150", initialWh: "RAW" },
    { sku: "RM-GRN-KINT", name: "Biji Kopi Mentah Arabica Bali Kintamani Anaerobic", description: "Citrusy bright acidity, processed anaerobic natural", cat: "COFFEE_GREEN", type: "RAW_MATERIAL", supply: "BUY", uom: "KG", cost: "140000", rop: "40", safety: "10", leadDays: 6, moq: "30", lotSize: "10", initialStock: "120", initialWh: "RAW" },
    { sku: "RM-GRN-FLOR", name: "Biji Kopi Mentah Arabica Flores Bajawa Washed", description: "Notes of chocolate and caramel, medium acidity", cat: "COFFEE_GREEN", type: "RAW_MATERIAL", supply: "BUY", uom: "KG", cost: "118000", rop: "50", safety: "15", leadDays: 8, moq: "30", lotSize: "15", initialStock: "100", initialWh: "RAW" },
    { sku: "RM-GRN-PREA", name: "Biji Kopi Mentah Arabica Java Preanger Honey", description: "Yellow honey process Gunung Puntang, sweet finish", cat: "COFFEE_GREEN", type: "RAW_MATERIAL", supply: "BUY", uom: "KG", cost: "125000", rop: "40", safety: "10", leadDays: 4, moq: "20", lotSize: "10", initialStock: "90", initialWh: "RAW" },
    { sku: "RM-GRN-PAPU", name: "Biji Kopi Mentah Arabica Papua Wamena Organic", description: "Kopi organik Lembah Baliem tanpa pestisida, smooth body", cat: "COFFEE_GREEN", type: "RAW_MATERIAL", supply: "BUY", uom: "KG", cost: "145000", rop: "30", safety: "10", leadDays: 10, moq: "30", lotSize: "10", initialStock: "80", initialWh: "RAW" },
    { sku: "RM-GRN-IJEN", name: "Biji Kopi Mentah Arabica Java Ijen Washed", description: "Spicy note, mild acidity, clean cup dari Gunung Ijen", cat: "COFFEE_GREEN", type: "RAW_MATERIAL", supply: "BUY", uom: "KG", cost: "112000", rop: "40", safety: "10", leadDays: 5, moq: "30", lotSize: "10", initialStock: "100", initialWh: "RAW" },
    { sku: "RM-GRN-KERI", name: "Biji Kopi Mentah Arabica Kerinci Jambi Natural", description: "Gunung Kerinci Kayu Aro, intense tropical fruit notes", cat: "COFFEE_GREEN", type: "RAW_MATERIAL", supply: "BUY", uom: "KG", cost: "130000", rop: "35", safety: "10", leadDays: 7, moq: "20", lotSize: "10", initialStock: "75", initialWh: "RAW" },
    { sku: "RM-GRN-ROB-LAMP", name: "Biji Kopi Mentah Robusta Lampung Fine Grade 1", description: "Selected robusta screen 18, bold chocolate & roasted peanut", cat: "COFFEE_GREEN", type: "RAW_MATERIAL", supply: "BUY", uom: "KG", cost: "68000", rop: "120", safety: "40", leadDays: 3, moq: "60", lotSize: "30", initialStock: "400", initialWh: "RAW" },
    { sku: "RM-GRN-ROB-DAMP", name: "Biji Kopi Mentah Robusta Dampit Malang", description: "Robusta dataran tinggi Dampit, aroma manis karamel tebal", cat: "COFFEE_GREEN", type: "RAW_MATERIAL", supply: "BUY", uom: "KG", cost: "72000", rop: "150", safety: "50", leadDays: 4, moq: "60", lotSize: "30", initialStock: "500", initialWh: "RAW" },
    { sku: "RM-GRN-ROB-TMNG", name: "Biji Kopi Mentah Robusta Temanggung Washed", description: "Robusta petik merah basah Temanggung, less harsh bitterness", cat: "COFFEE_GREEN", type: "RAW_MATERIAL", supply: "BUY", uom: "KG", cost: "75000", rop: "80", safety: "25", leadDays: 4, moq: "40", lotSize: "20", initialStock: "250", initialWh: "RAW" },
    { sku: "RM-GRN-ETH-YIRG", name: "Biji Kopi Mentah Impor Ethiopia Yirgacheffe G1", description: "Bergamot aroma, jasmine florals, elegant washed specialty", cat: "COFFEE_GREEN", type: "RAW_MATERIAL", supply: "BUY", uom: "KG", cost: "245000", rop: "20", safety: "5", leadDays: 14, moq: "15", lotSize: "5", initialStock: "50", initialWh: "RAW" },
    { sku: "RM-GRN-COL-SUPR", name: "Biji Kopi Mentah Impor Colombia Supremo Huila", description: "Sweet orange acidity, panela, milk chocolate balance", cat: "COFFEE_GREEN", type: "RAW_MATERIAL", supply: "BUY", uom: "KG", cost: "195000", rop: "25", safety: "8", leadDays: 14, moq: "15", lotSize: "5", initialStock: "60", initialWh: "RAW" },
    { sku: "RM-GRN-BRA-SANT", name: "Biji Kopi Mentah Impor Brazil Santos Cerrado", description: "Nutty, chocolate, low acidity, ideal for base espresso blend", cat: "COFFEE_GREEN", type: "RAW_MATERIAL", supply: "BUY", uom: "KG", cost: "175000", rop: "30", safety: "10", leadDays: 14, moq: "20", lotSize: "10", initialStock: "80", initialWh: "RAW" },
    { sku: "RM-GRN-GUA-ANTI", name: "Biji Kopi Mentah Impor Guatemala Antigua", description: "Volcanic soil, cocoa spice and crisp apple acidity", cat: "COFFEE_GREEN", type: "RAW_MATERIAL", supply: "BUY", uom: "KG", cost: "210000", rop: "20", safety: "5", leadDays: 14, moq: "15", lotSize: "5", initialStock: "40", initialWh: "RAW" },

    // ── RAW MATERIALS: Susu & Produk Olahan Susu (Dairy & Plant Milk) (12 items) ──
    { sku: "RM-DRY-MILK-PAS", name: "Susu Segar Pasteurisasi Full Cream 1L", description: "Susu sapi murni pasteurisasi dingin 3.8% fat", cat: "DAIRY_MILK", type: "RAW_MATERIAL", supply: "BUY", uom: "L", cost: "19500", rop: "100", safety: "30", leadDays: 1, moq: "50", lotSize: "10", initialStock: "250", initialWh: "RAW" },
    { sku: "RM-DRY-MILK-UHT", name: "Susu Sapi UHT Plain Barista Grade 1L", description: "Susu UHT shelf-stable khusus buih mikro latte art", cat: "DAIRY_MILK", type: "RAW_MATERIAL", supply: "BUY", uom: "L", cost: "17800", rop: "80", safety: "20", leadDays: 2, moq: "48", lotSize: "12", initialStock: "200", initialWh: "RAW" },
    { sku: "RM-DRY-MILK-SKM", name: "Susu Skim Cair Rendah Lemak 1L", description: "Low fat pasteurized milk 0.5% fat untuk menu diet", cat: "DAIRY_MILK", type: "RAW_MATERIAL", supply: "BUY", uom: "L", cost: "21000", rop: "30", safety: "10", leadDays: 2, moq: "24", lotSize: "12", initialStock: "60", initialWh: "RAW" },
    { sku: "RM-DRY-MILK-OAT", name: "Susu Gandum Oat Milk Barista Edition 1L", description: "Oatside / Minor Figures barista grade plant milk", cat: "DAIRY_MILK", type: "RAW_MATERIAL", supply: "BUY", uom: "L", cost: "38500", rop: "60", safety: "20", leadDays: 3, moq: "36", lotSize: "12", initialStock: "180", initialWh: "RAW" },
    { sku: "RM-DRY-MILK-SOY", name: "Susu Kedelai Soy Milk Barista Edition 1L", description: "Susu kedelai foamable tanpa rasa kapur", cat: "DAIRY_MILK", type: "RAW_MATERIAL", supply: "BUY", uom: "L", cost: "32000", rop: "25", safety: "8", leadDays: 3, moq: "24", lotSize: "12", initialStock: "80", initialWh: "RAW" },
    { sku: "RM-DRY-MILK-ALM", name: "Susu Kacang Almond Milk Unsweetened 1L", description: "Almond milk rendah kalori tanpa gula tambahan", cat: "DAIRY_MILK", type: "RAW_MATERIAL", supply: "BUY", uom: "L", cost: "42000", rop: "25", safety: "8", leadDays: 3, moq: "24", lotSize: "12", initialStock: "70", initialWh: "RAW" },
    { sku: "RM-DRY-MILK-CND", name: "Susu Kental Manis Full Cream Tin 500g", description: "SKM premium untuk campuran kopi tarik & vietnamese drip", cat: "DAIRY_MILK", type: "RAW_MATERIAL", supply: "BUY", uom: "KG", cost: "24000", rop: "40", safety: "15", leadDays: 2, moq: "24", lotSize: "12", initialStock: "120", initialWh: "RAW" },
    { sku: "RM-DRY-MILK-EVP", name: "Susu Evaporasi Tawar Tin 380g", description: "Evaporated milk untuk tekstur kopi susu creamy", cat: "DAIRY_MILK", type: "RAW_MATERIAL", supply: "BUY", uom: "KG", cost: "18500", rop: "50", safety: "15", leadDays: 2, moq: "48", lotSize: "24", initialStock: "150", initialWh: "RAW" },
    { sku: "RM-DRY-WHP-CRM", name: "Whipping Cream Dairy 35% Fat 1L", description: "Anchor / Elle & Vire cream kocok segar", cat: "DAIRY_MILK", type: "RAW_MATERIAL", supply: "BUY", uom: "L", cost: "78000", rop: "20", safety: "6", leadDays: 2, moq: "12", lotSize: "6", initialStock: "45", initialWh: "RAW" },
    { sku: "RM-DRY-NON-WHP", name: "Non-Dairy Whipping Topping Cream 1L", description: "Krim kocok nabati stabil tahan suhu ruang", cat: "DAIRY_MILK", type: "RAW_MATERIAL", supply: "BUY", uom: "L", cost: "45000", rop: "20", safety: "5", leadDays: 3, moq: "12", lotSize: "6", initialStock: "40", initialWh: "RAW" },
    { sku: "RM-DRY-YOG-PLN", name: "Yogurt Plain Greek Style Fermented 1KG", description: "Thick Greek yogurt untuk campuran smoothie & parfait", cat: "DAIRY_MILK", type: "RAW_MATERIAL", supply: "BUY", uom: "KG", cost: "55000", rop: "15", safety: "5", leadDays: 2, moq: "10", lotSize: "5", initialStock: "30", initialWh: "RAW" },
    { sku: "RM-DRY-BUT-MILK", name: "Buttermilk Pasteurized 1L", description: "Buttermilk asam segar untuk kelembutan adonan scone & waffle", cat: "DAIRY_MILK", type: "RAW_MATERIAL", supply: "BUY", uom: "L", cost: "34000", rop: "10", safety: "3", leadDays: 3, moq: "6", lotSize: "6", initialStock: "20", initialWh: "RAW" },

    // ── RAW MATERIALS: Sirup, Saus & Pemanis (18 items) ──
    { sku: "RM-SYR-AREN-LIQ", name: "Gula Aren Organik Cair Murni Nira", description: "Gula aren murni tanpa pemanis buatan brix 70", cat: "SYRUP_SWEETENER", type: "RAW_MATERIAL", supply: "BUY", uom: "L", cost: "32000", rop: "80", safety: "25", leadDays: 2, moq: "40", lotSize: "20", initialStock: "200", initialWh: "RAW" },
    { sku: "RM-SYR-AREN-SOL", name: "Gula Aren Batok Organik Premium", description: "Aren batok padat wangi untuk bahan sirup homemade", cat: "SYRUP_SWEETENER", type: "RAW_MATERIAL", supply: "BUY", uom: "KG", cost: "28000", rop: "50", safety: "15", leadDays: 3, moq: "25", lotSize: "25", initialStock: "100", initialWh: "RAW" },
    { sku: "RM-SYR-VANILLA", name: "Sirup Minuman Rasa Vanilla Artisan 750ml", description: "Natural bourbon vanilla bean flavoring syrup", cat: "SYRUP_SWEETENER", type: "RAW_MATERIAL", supply: "BUY", uom: "BTL", cost: "92000", rop: "15", safety: "5", leadDays: 3, moq: "12", lotSize: "6", initialStock: "36", initialWh: "RAW" },
    { sku: "RM-SYR-CARAMEL", name: "Sirup Minuman Rasa Salted Caramel 750ml", description: "Buttery sweet and salty caramel syrup", cat: "SYRUP_SWEETENER", type: "RAW_MATERIAL", supply: "BUY", uom: "BTL", cost: "92000", rop: "18", safety: "6", leadDays: 3, moq: "12", lotSize: "6", initialStock: "42", initialWh: "RAW" },
    { sku: "RM-SYR-HAZELN", name: "Sirup Minuman Rasa Roasted Hazelnut 750ml", description: "Rich toasted hazelnut coffee flavoring", cat: "SYRUP_SWEETENER", type: "RAW_MATERIAL", supply: "BUY", uom: "BTL", cost: "92000", rop: "15", safety: "5", leadDays: 3, moq: "12", lotSize: "6", initialStock: "30", initialWh: "RAW" },
    { sku: "RM-SYR-PANDAN", name: "Sirup Pandan Wangi Alami 750ml", description: "Natural screwpine extract syrup", cat: "SYRUP_SWEETENER", type: "RAW_MATERIAL", supply: "BUY", uom: "BTL", cost: "85000", rop: "12", safety: "4", leadDays: 3, moq: "12", lotSize: "6", initialStock: "28", initialWh: "RAW" },
    { sku: "RM-SYR-BUTTERS", name: "Sirup Butterscotch Creamy 750ml", description: "Rich brown sugar & butter syrup flavor", cat: "SYRUP_SWEETENER", type: "RAW_MATERIAL", supply: "BUY", uom: "BTL", cost: "95000", rop: "10", safety: "3", leadDays: 4, moq: "6", lotSize: "6", initialStock: "24", initialWh: "RAW" },
    { sku: "RM-SYR-CINNAMN", name: "Sirup Cinnamon Spiced 750ml", description: "Warm spiced cinnamon syrup for autumn lattes", cat: "SYRUP_SWEETENER", type: "RAW_MATERIAL", supply: "BUY", uom: "BTL", cost: "88000", rop: "8", safety: "3", leadDays: 4, moq: "6", lotSize: "6", initialStock: "18", initialWh: "RAW" },
    { sku: "RM-SYR-IRISH", name: "Sirup Irish Cream Flavor 750ml", description: "Non-alcoholic Irish cream coffee flavoring", cat: "SYRUP_SWEETENER", type: "RAW_MATERIAL", supply: "BUY", uom: "BTL", cost: "95000", rop: "8", safety: "2", leadDays: 4, moq: "6", lotSize: "6", initialStock: "16", initialWh: "RAW" },
    { sku: "RM-SYR-MINT", name: "Sirup Peppermint Fresh 750ml", description: "Cooling mint syrup for mochas and iced teas", cat: "SYRUP_SWEETENER", type: "RAW_MATERIAL", supply: "BUY", uom: "BTL", cost: "85000", rop: "8", safety: "2", leadDays: 3, moq: "6", lotSize: "6", initialStock: "18", initialWh: "RAW" },
    { sku: "RM-SYR-PEACH", name: "Sirup Buah White Peach 750ml", description: "Aromatic white peach syrup for sparkling sodas", cat: "SYRUP_SWEETENER", type: "RAW_MATERIAL", supply: "BUY", uom: "BTL", cost: "89000", rop: "12", safety: "4", leadDays: 3, moq: "6", lotSize: "6", initialStock: "26", initialWh: "RAW" },
    { sku: "RM-SYR-LYCHEE", name: "Sirup Buah Lychee Tropical 750ml", description: "Sweet tropical lychee fruit syrup", cat: "SYRUP_SWEETENER", type: "RAW_MATERIAL", supply: "BUY", uom: "BTL", cost: "89000", rop: "15", safety: "5", leadDays: 3, moq: "12", lotSize: "6", initialStock: "32", initialWh: "RAW" },
    { sku: "RM-SYR-BERRY", name: "Sirup Mixed Berry Forest 750ml", description: "Blackberry, raspberry and strawberry fruit syrup", cat: "SYRUP_SWEETENER", type: "RAW_MATERIAL", supply: "BUY", uom: "BTL", cost: "92000", rop: "10", safety: "3", leadDays: 3, moq: "6", lotSize: "6", initialStock: "20", initialWh: "RAW" },
    { sku: "RM-SYR-PASSION", name: "Sirup Passion Fruit / Markisa 750ml", description: "Tangy sweet passion fruit syrup", cat: "SYRUP_SWEETENER", type: "RAW_MATERIAL", supply: "BUY", uom: "BTL", cost: "89000", rop: "10", safety: "3", leadDays: 3, moq: "6", lotSize: "6", initialStock: "22", initialWh: "RAW" },
    { sku: "RM-SYR-MAPLE", name: "Sirup Maple Grade A Organik 500ml", description: "Pure Canadian maple syrup untuk pancake & waffle", cat: "SYRUP_SWEETENER", type: "RAW_MATERIAL", supply: "BUY", uom: "BTL", cost: "165000", rop: "6", safety: "2", leadDays: 5, moq: "6", lotSize: "3", initialStock: "15", initialWh: "RAW" },
    { sku: "RM-SYR-HONEY", name: "Madu Hutan Liar Murni Sumbawa", description: "Madu multiflora murni tanpa pengawet", cat: "SYRUP_SWEETENER", type: "RAW_MATERIAL", supply: "BUY", uom: "KG", cost: "95000", rop: "15", safety: "5", leadDays: 4, moq: "10", lotSize: "5", initialStock: "35", initialWh: "RAW" },
    { sku: "RM-SYR-GLUC", name: "Sirup Glukosa Bening Food Grade", description: "Glucose syrup kental untuk kelembutan glaze & karamel", cat: "SYRUP_SWEETENER", type: "RAW_MATERIAL", supply: "BUY", uom: "KG", cost: "22000", rop: "20", safety: "5", leadDays: 3, moq: "20", lotSize: "10", initialStock: "50", initialWh: "RAW" },
    { sku: "RM-SYR-SUGAR-W", name: "Gula Pasir Putih Rafinasi Tebu", description: "Gula pasir butiran halus murni 50kg bag", cat: "SYRUP_SWEETENER", type: "RAW_MATERIAL", supply: "BUY", uom: "KG", cost: "16500", rop: "100", safety: "50", leadDays: 2, moq: "100", lotSize: "50", initialStock: "300", initialWh: "RAW" },

    // ── RAW MATERIALS: Bubuk Minuman, Cokelat & Perisa (12 items) ──
    { sku: "RM-PWD-MATCHA-U", name: "Pure Matcha Powder Ceremoni Uji Kyoto", description: "First harvest green tea powder dari Uji, Jepang", cat: "BEVERAGE_POWDER", type: "RAW_MATERIAL", supply: "BUY", uom: "KG", cost: "520000", rop: "10", safety: "3", leadDays: 7, moq: "5", lotSize: "2", initialStock: "25", initialWh: "RAW" },
    { sku: "RM-PWD-MATCHA-B", name: "Culinary Grade Matcha Powder", description: "Matcha untuk campuran adonan cookies & pastry", cat: "BEVERAGE_POWDER", type: "RAW_MATERIAL", supply: "BUY", uom: "KG", cost: "280000", rop: "15", safety: "5", leadDays: 4, moq: "5", lotSize: "5", initialStock: "30", initialWh: "RAW" },
    { sku: "RM-PWD-HOJICHA", name: "Hojicha Roasted Green Tea Powder", description: "Biji daun teh sangrai aroma nutty earthy khas Kyoto", cat: "BEVERAGE_POWDER", type: "RAW_MATERIAL", supply: "BUY", uom: "KG", cost: "340000", rop: "8", safety: "2", leadDays: 7, moq: "5", lotSize: "2", initialStock: "18", initialWh: "RAW" },
    { sku: "RM-PWD-COCOA-DK", name: "Pure Dark Dutch Cocoa Powder 22-24% Fat", description: "Bubuk kakao murni proses Belanda lemak tinggi", cat: "BEVERAGE_POWDER", type: "RAW_MATERIAL", supply: "BUY", uom: "KG", cost: "115000", rop: "30", safety: "10", leadDays: 3, moq: "25", lotSize: "10", initialStock: "80", initialWh: "RAW" },
    { sku: "RM-PWD-COCOA-BK", name: "Black Cocoa Powder Intense", description: "Bubuk kakao hitam pekat untuk biskuit Oreo style", cat: "BEVERAGE_POWDER", type: "RAW_MATERIAL", supply: "BUY", uom: "KG", cost: "135000", rop: "10", safety: "3", leadDays: 4, moq: "10", lotSize: "5", initialStock: "25", initialWh: "RAW" },
    { sku: "RM-PWD-CHOC-MIL", name: "Sweet Chocolate Drink Powder Premium", description: "Campuran bubuk cokelat manis siap seduh", cat: "BEVERAGE_POWDER", type: "RAW_MATERIAL", supply: "BUY", uom: "KG", cost: "85000", rop: "40", safety: "15", leadDays: 2, moq: "20", lotSize: "10", initialStock: "100", initialWh: "RAW" },
    { sku: "RM-PWD-RED-VELV", name: "Red Velvet Powder Base Mix", description: "Bubuk minuman Red Velvet dengan cocoa dan vanilla note", cat: "BEVERAGE_POWDER", type: "RAW_MATERIAL", supply: "BUY", uom: "KG", cost: "95000", rop: "20", safety: "5", leadDays: 3, moq: "10", lotSize: "5", initialStock: "40", initialWh: "RAW" },
    { sku: "RM-PWD-TARO", name: "Taro Sweet Potato Powder Drink Mix", description: "Bubuk rasa talas ungu manis creamy", cat: "BEVERAGE_POWDER", type: "RAW_MATERIAL", supply: "BUY", uom: "KG", cost: "88000", rop: "15", safety: "5", leadDays: 3, moq: "10", lotSize: "5", initialStock: "35", initialWh: "RAW" },
    { sku: "RM-PWD-CHARCOAL", name: "Activated Bamboo Charcoal Food Powder", description: "Arang bambu aktif untuk minuman hitam eksotis", cat: "BEVERAGE_POWDER", type: "RAW_MATERIAL", supply: "BUY", uom: "KG", cost: "160000", rop: "5", safety: "2", leadDays: 5, moq: "5", lotSize: "2", initialStock: "12", initialWh: "RAW" },
    { sku: "RM-PWD-CHAI", name: "Spiced Chai Tea Powder Blend", description: "Kapulaga, kayu manis, jahe, dan cengkeh bubuk", cat: "BEVERAGE_POWDER", type: "RAW_MATERIAL", supply: "BUY", uom: "KG", cost: "140000", rop: "8", safety: "2", leadDays: 4, moq: "5", lotSize: "2", initialStock: "15", initialWh: "RAW" },
    { sku: "RM-PWD-CINNAMON", name: "Bubuk Kayu Manis Cassia Ceylon Halus", description: "Ground cinnamon murni untuk taburan cappuccino & bakery", cat: "BEVERAGE_POWDER", type: "RAW_MATERIAL", supply: "BUY", uom: "KG", cost: "85000", rop: "15", safety: "5", leadDays: 3, moq: "10", lotSize: "5", initialStock: "30", initialWh: "RAW" },
    { sku: "RM-PWD-NUTMEG", name: "Bubuk Pala Organik Maluku", description: "Pala bubuk murni aroma hangat untuk pastry & chai", cat: "BEVERAGE_POWDER", type: "RAW_MATERIAL", supply: "BUY", uom: "KG", cost: "120000", rop: "5", safety: "2", leadDays: 5, moq: "5", lotSize: "2", initialStock: "10", initialWh: "RAW" },

    // ── RAW MATERIALS: Teh & Bahan Herbal Botani (12 items) ──
    { sku: "RM-TEA-EARL-GRY", name: "Daun Teh Hitam Earl Grey Bergamot", description: "Whole leaf black tea scented with Italian bergamot oil", cat: "TEA_BOTANICAL", type: "RAW_MATERIAL", supply: "BUY", uom: "KG", cost: "185000", rop: "15", safety: "5", leadDays: 4, moq: "10", lotSize: "5", initialStock: "35", initialWh: "RAW" },
    { sku: "RM-TEA-ENG-BRKF", name: "Daun Teh Hitam English Breakfast Ceylon", description: "Robust full-bodied Assam & Ceylon black tea blend", cat: "TEA_BOTANICAL", type: "RAW_MATERIAL", supply: "BUY", uom: "KG", cost: "165000", rop: "15", safety: "5", leadDays: 4, moq: "10", lotSize: "5", initialStock: "30", initialWh: "RAW" },
    { sku: "RM-TEA-JASMINE", name: "Teh Hijau Melati Jasmine Blossom Premium", description: "Green tea scented with fresh night-blooming jasmine", cat: "TEA_BOTANICAL", type: "RAW_MATERIAL", supply: "BUY", uom: "KG", cost: "155000", rop: "20", safety: "5", leadDays: 3, moq: "10", lotSize: "5", initialStock: "45", initialWh: "RAW" },
    { sku: "RM-TEA-SENCHA", name: "Teh Hijau Jepang Sencha First Flush", description: "Steamed Japanese green tea refreshing grassy vegetal", cat: "TEA_BOTANICAL", type: "RAW_MATERIAL", supply: "BUY", uom: "KG", cost: "240000", rop: "10", safety: "3", leadDays: 7, moq: "5", lotSize: "2", initialStock: "20", initialWh: "RAW" },
    { sku: "RM-TEA-GENMAI", name: "Teh Genmaicha Roasted Brown Rice", description: "Green tea with toasted popped brown rice", cat: "TEA_BOTANICAL", type: "RAW_MATERIAL", supply: "BUY", uom: "KG", cost: "195000", rop: "10", safety: "3", leadDays: 7, moq: "5", lotSize: "2", initialStock: "18", initialWh: "RAW" },
    { sku: "RM-TEA-CHAMOMIL", name: "Bunga Chamomile Kering Mesir", description: "Whole chamomile flower heads herbal caffeine-free", cat: "TEA_BOTANICAL", type: "RAW_MATERIAL", supply: "BUY", uom: "KG", cost: "280000", rop: "8", safety: "2", leadDays: 5, moq: "5", lotSize: "2", initialStock: "15", initialWh: "RAW" },
    { sku: "RM-TEA-PEPRMINT", name: "Daun Peppermint Kering Organik", description: "Crisp cooling peppermint leaves for tisane brews", cat: "TEA_BOTANICAL", type: "RAW_MATERIAL", supply: "BUY", uom: "KG", cost: "220000", rop: "8", safety: "2", leadDays: 4, moq: "5", lotSize: "2", initialStock: "16", initialWh: "RAW" },
    { sku: "RM-TEA-HIBISCUS", name: "Kelopak Bunga Rosella / Hibiscus Kering", description: "Tart ruby red herbal flowers for iced cascara teas", cat: "TEA_BOTANICAL", type: "RAW_MATERIAL", supply: "BUY", uom: "KG", cost: "95000", rop: "15", safety: "5", leadDays: 3, moq: "10", lotSize: "5", initialStock: "30", initialWh: "RAW" },
    { sku: "RM-TEA-LAVENDER", name: "Bunga Lavender Kering French Culinary", description: "Aromatic edible lavender flowers for floral syrups", cat: "TEA_BOTANICAL", type: "RAW_MATERIAL", supply: "BUY", uom: "KG", cost: "320000", rop: "5", safety: "1", leadDays: 7, moq: "2", lotSize: "1", initialStock: "8", initialWh: "RAW" },
    { sku: "RM-TEA-CASCARA", name: "Kulit Ceri Kopi Cascara Sun-Dried Gayo", description: "Dried coffee fruit skin high in antioxidants", cat: "TEA_BOTANICAL", type: "RAW_MATERIAL", supply: "BUY", uom: "KG", cost: "125000", rop: "20", safety: "5", leadDays: 5, moq: "10", lotSize: "5", initialStock: "40", initialWh: "RAW" },
    { sku: "RM-TEA-OOLONG", name: "Teh Oolong Tie Guan Yin High Mountain", description: "Semi-fermented floral orchid fragrance oolong", cat: "TEA_BOTANICAL", type: "RAW_MATERIAL", supply: "BUY", uom: "KG", cost: "260000", rop: "8", safety: "2", leadDays: 6, moq: "5", lotSize: "2", initialStock: "18", initialWh: "RAW" },
    { sku: "RM-TEA-LEMONGRS", name: "Batang Serai Kering Potong Organik", description: "Dried cut lemongrass stalks for citrus herbal infusions", cat: "TEA_BOTANICAL", type: "RAW_MATERIAL", supply: "BUY", uom: "KG", cost: "65000", rop: "10", safety: "3", leadDays: 3, moq: "5", lotSize: "5", initialStock: "20", initialWh: "RAW" },

    // ── RAW MATERIALS: Bahan Pokok Roti & Pastry (12 items) ──
    { sku: "RM-BAK-FLR-HI", name: "Tepung Terigu Protein Tinggi (Cakra Kembar)", description: "Wheat flour protein 13.5% untuk adonan roti & croissant", cat: "BAKERY_FLOUR", type: "RAW_MATERIAL", supply: "BUY", uom: "KG", cost: "14500", rop: "150", safety: "50", leadDays: 2, moq: "100", lotSize: "50", initialStock: "500", initialWh: "RAW" },
    { sku: "RM-BAK-FLR-MED", name: "Tepung Terigu Protein Sedang (Segitiga Biru)", description: "All purpose flour protein 11% untuk cookies & pastry", cat: "BAKERY_FLOUR", type: "RAW_MATERIAL", supply: "BUY", uom: "KG", cost: "13500", rop: "100", safety: "40", leadDays: 2, moq: "100", lotSize: "50", initialStock: "350", initialWh: "RAW" },
    { sku: "RM-BAK-FLR-LOW", name: "Tepung Terigu Protein Rendah Kunci Biru", description: "Cake flour protein 8.5% untuk sponge cake & scone", cat: "BAKERY_FLOUR", type: "RAW_MATERIAL", supply: "BUY", uom: "KG", cost: "14000", rop: "80", safety: "25", leadDays: 2, moq: "50", lotSize: "25", initialStock: "200", initialWh: "RAW" },
    { sku: "RM-BAK-FLR-WHL", name: "Tepung Gandum Utuh Whole Wheat Coarse", description: "Coarse ground whole wheat flour with bran", cat: "BAKERY_FLOUR", type: "RAW_MATERIAL", supply: "BUY", uom: "KG", cost: "22000", rop: "30", safety: "10", leadDays: 3, moq: "25", lotSize: "25", initialStock: "80", initialWh: "RAW" },
    { sku: "RM-BAK-FLR-RYE", name: "Tepung Gandum Hitam Dark Rye Flour", description: "Organic rye flour untuk sourdough artisan bread", cat: "BAKERY_FLOUR", type: "RAW_MATERIAL", supply: "BUY", uom: "KG", cost: "38000", rop: "20", safety: "5", leadDays: 4, moq: "10", lotSize: "10", initialStock: "40", initialWh: "RAW" },
    { sku: "RM-BAK-FLR-ALM", name: "Tepung Almond Murni Extra Fine Blanched", description: "Skinless finely ground California almond flour", cat: "BAKERY_FLOUR", type: "RAW_MATERIAL", supply: "BUY", uom: "KG", cost: "165000", rop: "25", safety: "8", leadDays: 3, moq: "15", lotSize: "5", initialStock: "60", initialWh: "RAW" },
    { sku: "RM-BAK-YEAST-D", name: "Ragi Instan Kering Saf-Instant Gold", description: "High-sugar tolerance dry yeast untuk adonan manis", cat: "BAKERY_FLOUR", type: "RAW_MATERIAL", supply: "BUY", uom: "KG", cost: "85000", rop: "10", safety: "3", leadDays: 2, moq: "10", lotSize: "5", initialStock: "30", initialWh: "RAW" },
    { sku: "RM-BAK-YEAST-F", name: "Ragi Basah Fresh Compressed Yeast", description: "Live compressed fresh yeast 500g block", cat: "BAKERY_FLOUR", type: "RAW_MATERIAL", supply: "BUY", uom: "KG", cost: "45000", rop: "8", safety: "2", leadDays: 2, moq: "5", lotSize: "5", initialStock: "15", initialWh: "RAW" },
    { sku: "RM-BAK-BAK-PWD", name: "Baking Powder Double Acting Aluminium Free", description: "Pengembang kue aksi ganda tanpa rasa pahit", cat: "BAKERY_FLOUR", type: "RAW_MATERIAL", supply: "BUY", uom: "KG", cost: "48000", rop: "15", safety: "5", leadDays: 2, moq: "10", lotSize: "5", initialStock: "35", initialWh: "RAW" },
    { sku: "RM-BAK-BAK-SOD", name: "Baking Soda Natrium Bikarbonat Pure", description: "Food grade sodium bicarbonate untuk cookies & red velvet", cat: "BAKERY_FLOUR", type: "RAW_MATERIAL", supply: "BUY", uom: "KG", cost: "25000", rop: "15", safety: "5", leadDays: 2, moq: "10", lotSize: "5", initialStock: "30", initialWh: "RAW" },
    { sku: "RM-BAK-SALT-SEA", name: "Garam Laut Halus Bali Sea Salt", description: "Natural solar-evaporated fine sea salt Kusamba", cat: "BAKERY_FLOUR", type: "RAW_MATERIAL", supply: "BUY", uom: "KG", cost: "18000", rop: "20", safety: "8", leadDays: 2, moq: "20", lotSize: "10", initialStock: "60", initialWh: "RAW" },
    { sku: "RM-BAK-TARTAR", name: "Cream of Tartar Pure Baking Grade", description: "Stabilizer kocokan putih telur meringue & chiffon", cat: "BAKERY_FLOUR", type: "RAW_MATERIAL", supply: "BUY", uom: "KG", cost: "90000", rop: "5", safety: "1", leadDays: 3, moq: "2", lotSize: "1", initialStock: "8", initialWh: "RAW" },

    // ── RAW MATERIALS: Lemak, Keju & Telur Pastry (12 items) ──
    { sku: "RM-FAT-BUT-SHT", name: "Mentega Lembaran Pastry French Butter Sheet 84%", description: "Elle & Vire / Corman tournage sheet butter untuk laminasi croissant", cat: "BAKERY_FAT_DAIRY", type: "RAW_MATERIAL", supply: "BUY", uom: "KG", cost: "175000", rop: "50", safety: "15", leadDays: 3, moq: "20", lotSize: "10", initialStock: "120", initialWh: "RAW" },
    { sku: "RM-FAT-BUT-UNS", name: "Mentega Tawar Blok Unsalted Butter Elle & Vire", description: "Mentega tawar murni 82% fat untuk adonan cake & cookies", cat: "BAKERY_FAT_DAIRY", type: "RAW_MATERIAL", supply: "BUY", uom: "KG", cost: "155000", rop: "40", safety: "15", leadDays: 3, moq: "25", lotSize: "5", initialStock: "100", initialWh: "RAW" },
    { sku: "RM-FAT-BUT-SLT", name: "Mentega Asin Blok Salted Butter Anchor", description: "Lactic salted butter untuk olesan roti & caramel", cat: "BAKERY_FAT_DAIRY", type: "RAW_MATERIAL", supply: "BUY", uom: "KG", cost: "148000", rop: "30", safety: "10", leadDays: 3, moq: "25", lotSize: "5", initialStock: "80", initialWh: "RAW" },
    { sku: "RM-FAT-EGG-FRE", name: "Telur Ayam Negeri Omega 3 Segar", description: "Telur segar cangkang tebal bebas salmonella", cat: "BAKERY_FAT_DAIRY", type: "RAW_MATERIAL", supply: "BUY", uom: "KG", cost: "32000", rop: "40", safety: "15", leadDays: 1, moq: "30", lotSize: "15", initialStock: "90", initialWh: "RAW" },
    { sku: "RM-FAT-EGG-YOL", name: "Kuning Telur Cair Pasteurisasi", description: "Pasteurized liquid egg yolk 1kg carton pack", cat: "BAKERY_FAT_DAIRY", type: "RAW_MATERIAL", supply: "BUY", uom: "KG", cost: "68000", rop: "15", safety: "5", leadDays: 2, moq: "10", lotSize: "5", initialStock: "30", initialWh: "RAW" },
    { sku: "RM-FAT-EGG-WHT", name: "Putih Telur Cair Pasteurisasi", description: "Pasteurized liquid egg white 1kg carton pack", cat: "BAKERY_FAT_DAIRY", type: "RAW_MATERIAL", supply: "BUY", uom: "KG", cost: "45000", rop: "15", safety: "5", leadDays: 2, moq: "10", lotSize: "5", initialStock: "28", initialWh: "RAW" },
    { sku: "RM-FAT-CRM-CHE", name: "Keju Krim Cream Cheese Philadelphia Block", description: "Rich creamy block cream cheese untuk Basque cheesecake", cat: "BAKERY_FAT_DAIRY", type: "RAW_MATERIAL", supply: "BUY", uom: "KG", cost: "135000", rop: "30", safety: "10", leadDays: 3, moq: "20", lotSize: "10", initialStock: "80", initialWh: "RAW" },
    { sku: "RM-FAT-MAS-CAR", name: "Keju Mascarpone Import Italia", description: "Fresh Italian mascarpone cheese untuk tiramisu", cat: "BAKERY_FAT_DAIRY", type: "RAW_MATERIAL", supply: "BUY", uom: "KG", cost: "185000", rop: "15", safety: "5", leadDays: 4, moq: "10", lotSize: "5", initialStock: "35", initialWh: "RAW" },
    { sku: "RM-FAT-MOZ-ZAR", name: "Keju Mozzarella Blok Melter", description: "Stretchy whole milk mozzarella block untuk savory croissant", cat: "BAKERY_FAT_DAIRY", type: "RAW_MATERIAL", supply: "BUY", uom: "KG", cost: "115000", rop: "20", safety: "5", leadDays: 3, moq: "10", lotSize: "5", initialStock: "40", initialWh: "RAW" },
    { sku: "RM-FAT-CHD-AGD", name: "Keju Cheddar Tua Red Cheddar Block", description: "Sharp aged red cheddar untuk topping pastry gurih", cat: "BAKERY_FAT_DAIRY", type: "RAW_MATERIAL", supply: "BUY", uom: "KG", cost: "125000", rop: "15", safety: "5", leadDays: 3, moq: "10", lotSize: "5", initialStock: "35", initialWh: "RAW" },
    { sku: "RM-FAT-PAR-MES", name: "Keju Parmesan Grana Padano Bubuk", description: "Grated hard aged parmesan cheese", cat: "BAKERY_FAT_DAIRY", type: "RAW_MATERIAL", supply: "BUY", uom: "KG", cost: "240000", rop: "8", safety: "2", leadDays: 4, moq: "5", lotSize: "2", initialStock: "16", initialWh: "RAW" },
    { sku: "RM-FAT-CAN-OIL", name: "Minyak Bunga Kanola Murni", description: "Neutral canola cooking oil untuk chiffon & carrot cake", cat: "BAKERY_FAT_DAIRY", type: "RAW_MATERIAL", supply: "BUY", uom: "L", cost: "38000", rop: "20", safety: "5", leadDays: 2, moq: "20", lotSize: "10", initialStock: "50", initialWh: "RAW" },

    // ── RAW MATERIALS: Cokelat Couverture, Kacang & Buah (14 items) ──
    { sku: "RM-CHO-COU-70", name: "Cokelat Hitam Dark Couverture Callebaut 70.5%", description: "Belgian dark chocolate callets 70-30-38 intense cocoa", cat: "CHOCOLATE_FRUIT", type: "RAW_MATERIAL", supply: "BUY", uom: "KG", cost: "185000", rop: "30", safety: "10", leadDays: 3, moq: "20", lotSize: "10", initialStock: "90", initialWh: "RAW" },
    { sku: "RM-CHO-COU-54", name: "Cokelat Hitam Semi-Sweet Couverture 54.5%", description: "Balanced dark chocolate callets Callebaut 811", cat: "CHOCOLATE_FRUIT", type: "RAW_MATERIAL", supply: "BUY", uom: "KG", cost: "165000", rop: "35", safety: "10", leadDays: 3, moq: "20", lotSize: "10", initialStock: "100", initialWh: "RAW" },
    { sku: "RM-CHO-COU-MLK", name: "Cokelat Susu Milk Couverture 33.6%", description: "Creamy caramel-hinted milk chocolate callets Callebaut 823", cat: "CHOCOLATE_FRUIT", type: "RAW_MATERIAL", supply: "BUY", uom: "KG", cost: "175000", rop: "20", safety: "5", leadDays: 3, moq: "15", lotSize: "5", initialStock: "60", initialWh: "RAW" },
    { sku: "RM-CHO-COU-WHT", name: "Cokelat Putih White Couverture Velvet 32%", description: "Silky cocoa butter white chocolate Callebaut W2", cat: "CHOCOLATE_FRUIT", type: "RAW_MATERIAL", supply: "BUY", uom: "KG", cost: "180000", rop: "20", safety: "5", leadDays: 3, moq: "15", lotSize: "5", initialStock: "50", initialWh: "RAW" },
    { sku: "RM-CHO-BAT-DRK", name: "Cokelat Stick Baton Khusus Croissant 44%", description: "Bake-stable dark chocolate batons untuk pain au chocolat", cat: "CHOCOLATE_FRUIT", type: "RAW_MATERIAL", supply: "BUY", uom: "KG", cost: "155000", rop: "25", safety: "8", leadDays: 3, moq: "16", lotSize: "8", initialStock: "70", initialWh: "RAW" },
    { sku: "RM-CHO-CHIP-DK", name: "Dark Chocolate Chips Bake-Stable", description: "Bake-stable semi-sweet chocolate chips untuk cookies", cat: "CHOCOLATE_FRUIT", type: "RAW_MATERIAL", supply: "BUY", uom: "KG", cost: "95000", rop: "30", safety: "10", leadDays: 2, moq: "20", lotSize: "10", initialStock: "80", initialWh: "RAW" },
    { sku: "RM-CHO-CHIP-WH", name: "White Chocolate Chips Bake-Stable", description: "Bake-stable sweet white chips untuk red velvet cookies", cat: "CHOCOLATE_FRUIT", type: "RAW_MATERIAL", supply: "BUY", uom: "KG", cost: "105000", rop: "20", safety: "5", leadDays: 2, moq: "15", lotSize: "5", initialStock: "45", initialWh: "RAW" },
    { sku: "RM-CHO-COCO-BUT", name: "Pure Cocoa Butter Deodorized", description: "Lemak kakao murni deodorisasi untuk pelapis cokelat crunchy", cat: "CHOCOLATE_FRUIT", type: "RAW_MATERIAL", supply: "BUY", uom: "KG", cost: "210000", rop: "10", safety: "3", leadDays: 4, moq: "5", lotSize: "5", initialStock: "25", initialWh: "RAW" },
    { sku: "RM-CHO-NUTELLA", name: "Selai Cokelat Hazelnut Nutella Bucket 3kg", description: "Foodservice size hazelnut spread", cat: "CHOCOLATE_FRUIT", type: "RAW_MATERIAL", supply: "BUY", uom: "KG", cost: "135000", rop: "15", safety: "5", leadDays: 2, moq: "12", lotSize: "6", initialStock: "36", initialWh: "RAW" },
    { sku: "RM-TOP-ALM-SLC", name: "Kacang Almond Slice Panggang", description: "Toasted sliced almonds untuk taburan almond croissant", cat: "CHOCOLATE_FRUIT", type: "RAW_MATERIAL", supply: "BUY", uom: "KG", cost: "145000", rop: "20", safety: "5", leadDays: 3, moq: "10", lotSize: "5", initialStock: "50", initialWh: "RAW" },
    { sku: "RM-TOP-PEC-HAL", name: "Kacang Pecan Halves Mentah", description: "Raw pecan halves untuk cinnamon rolls & cookies", cat: "CHOCOLATE_FRUIT", type: "RAW_MATERIAL", supply: "BUY", uom: "KG", cost: "240000", rop: "10", safety: "3", leadDays: 5, moq: "5", lotSize: "2", initialStock: "20", initialWh: "RAW" },
    { sku: "RM-TOP-WAL-NUT", name: "Kacang Walnut Raw Halves", description: "Raw English walnut halves untuk banana bread", cat: "CHOCOLATE_FRUIT", type: "RAW_MATERIAL", supply: "BUY", uom: "KG", cost: "185000", rop: "15", safety: "5", leadDays: 4, moq: "10", lotSize: "5", initialStock: "35", initialWh: "RAW" },
    { sku: "RM-TOP-RAISINS", name: "Kismis Hitam California Seedless", description: "Sun-dried seedless dark raisins untuk cinnamon buns", cat: "CHOCOLATE_FRUIT", type: "RAW_MATERIAL", supply: "BUY", uom: "KG", cost: "65000", rop: "15", safety: "5", leadDays: 3, moq: "10", lotSize: "5", initialStock: "30", initialWh: "RAW" },
    { sku: "RM-TOP-VAN-EXT", name: "Ekstrak Bourbon Vanilla Madagaskar Murni", description: "Pure single-fold Madagascar vanilla extract", cat: "CHOCOLATE_FRUIT", type: "RAW_MATERIAL", supply: "BUY", uom: "L", cost: "650000", rop: "5", safety: "1", leadDays: 7, moq: "2", lotSize: "1", initialStock: "8", initialWh: "RAW" },

    // ── PURCHASED COMPONENTS: Gelas, Botol & Wadah (14 items) ──
    { sku: "PC-CUP-HOT-08", name: "Paper Cup Panas Double Wall Kraft 8oz", description: "Cangkir kertas dobel dinding 8oz untuk piccolo & flat white", cat: "PACKAGING_CUP", type: "PURCHASED_COMPONENT", supply: "BUY", uom: "PCS", cost: "950", rop: "500", safety: "200", leadDays: 3, moq: "500", lotSize: "100", initialStock: "2000", initialWh: "RAW" },
    { sku: "PC-CUP-HOT-12", name: "Paper Cup Panas Double Wall Kraft 12oz", description: "Cangkir kertas dobel dinding 12oz untuk latte & cappuccino", cat: "PACKAGING_CUP", type: "PURCHASED_COMPONENT", supply: "BUY", uom: "PCS", cost: "1150", rop: "800", safety: "300", leadDays: 3, moq: "1000", lotSize: "200", initialStock: "3500", initialWh: "RAW" },
    { sku: "PC-CUP-HOT-16", name: "Paper Cup Panas Double Wall Putih 16oz", description: "Cangkir kertas 16oz ukuran besar untuk americano panas", cat: "PACKAGING_CUP", type: "PURCHASED_COMPONENT", supply: "BUY", uom: "PCS", cost: "1350", rop: "300", safety: "100", leadDays: 3, moq: "500", lotSize: "100", initialStock: "1200", initialWh: "RAW" },
    { sku: "PC-CUP-PET-12", name: "Gelas Dingin Plastik Bening PET 12oz", description: "Gelas plastik bening tebal 12oz diameter 98mm", cat: "PACKAGING_CUP", type: "PURCHASED_COMPONENT", supply: "BUY", uom: "PCS", cost: "680", rop: "600", safety: "200", leadDays: 3, moq: "1000", lotSize: "200", initialStock: "2500", initialWh: "RAW" },
    { sku: "PC-CUP-PET-16", name: "Gelas Dingin Plastik Bening PET 16oz", description: "Gelas plastik bening standar 16oz diameter 98mm", cat: "PACKAGING_CUP", type: "PURCHASED_COMPONENT", supply: "BUY", uom: "PCS", cost: "780", rop: "1000", safety: "400", leadDays: 3, moq: "1000", lotSize: "500", initialStock: "5000", initialWh: "RAW" },
    { sku: "PC-CUP-PET-22", name: "Gelas Dingin Plastik Bening PET 22oz", description: "Gelas plastik jumbo 22oz diameter 98mm", cat: "PACKAGING_CUP", type: "PURCHASED_COMPONENT", supply: "BUY", uom: "PCS", cost: "980", rop: "400", safety: "150", leadDays: 3, moq: "500", lotSize: "200", initialStock: "1500", initialWh: "RAW" },
    { sku: "PC-CAN-ALU-330", name: "Kaleng Minuman Aluminium Bening 330ml", description: "Sleek aluminum beverage can 330ml seaming end", cat: "PACKAGING_CUP", type: "PURCHASED_COMPONENT", supply: "BUY", uom: "PCS", cost: "2400", rop: "500", safety: "200", leadDays: 5, moq: "500", lotSize: "250", initialStock: "1800", initialWh: "RAW" },
    { sku: "PC-BTL-GLS-250", name: "Botol Kaca Boston Round Amber 250ml", description: "Botol kaca cokelat gelap 250ml leher 28mm", cat: "PACKAGING_CUP", type: "PURCHASED_COMPONENT", supply: "BUY", uom: "PCS", cost: "3800", rop: "400", safety: "150", leadDays: 5, moq: "300", lotSize: "100", initialStock: "1200", initialWh: "RAW" },
    { sku: "PC-BTL-GLS-500", name: "Botol Kaca Cold Brew Bening 500ml", description: "Botol kaca bening tebal 500ml leher 28mm", cat: "PACKAGING_CUP", type: "PURCHASED_COMPONENT", supply: "BUY", uom: "PCS", cost: "5200", rop: "200", safety: "80", leadDays: 5, moq: "200", lotSize: "50", initialStock: "600", initialWh: "RAW" },
    { sku: "PC-BTL-PET-250", name: "Botol Plastik PET Tebal Kotak 250ml", description: "Botol plastik kotak modern bening leher 28mm", cat: "PACKAGING_CUP", type: "PURCHASED_COMPONENT", supply: "BUY", uom: "PCS", cost: "1400", rop: "600", safety: "250", leadDays: 3, moq: "500", lotSize: "250", initialStock: "2500", initialWh: "RAW" },
    { sku: "PC-BTL-PET-500", name: "Botol Plastik PET Bening Round 500ml", description: "Botol plastik bulat bening leher 28mm", cat: "PACKAGING_CUP", type: "PURCHASED_COMPONENT", supply: "BUY", uom: "PCS", cost: "1800", rop: "300", safety: "100", leadDays: 3, moq: "300", lotSize: "100", initialStock: "1000", initialWh: "RAW" },
    { sku: "PC-BTL-PET-1000", name: "Botol Plastik PET Jerigen Handle 1 Liter", description: "Botol jerigen mini 1000ml dengan pegangan leher 28mm", cat: "PACKAGING_CUP", type: "PURCHASED_COMPONENT", supply: "BUY", uom: "PCS", cost: "3100", rop: "400", safety: "150", leadDays: 4, moq: "400", lotSize: "100", initialStock: "1500", initialWh: "RAW" },
    { sku: "PC-FLT-DRIP-BAG", name: "Kantong Filter Kopi Drip Bag Jepang V-Shape", description: "Food grade non-woven hanging ear drip filter", cat: "PACKAGING_CUP", type: "PURCHASED_COMPONENT", supply: "BUY", uom: "PCS", cost: "650", rop: "1000", safety: "400", leadDays: 4, moq: "1000", lotSize: "500", initialStock: "4000", initialWh: "RAW" },
    { sku: "PC-FLT-COLD-BRW", name: "Kantong Filter Mesh Cold Brew Non-Woven 50L", description: "Large commercial brew bag for 50L immersion tank", cat: "PACKAGING_CUP", type: "PURCHASED_COMPONENT", supply: "BUY", uom: "PCS", cost: "12500", rop: "20", safety: "5", leadDays: 3, moq: "20", lotSize: "10", initialStock: "60", initialWh: "RAW" },

    // ── PURCHASED COMPONENTS: Tutup Gelas, Sedotan & Segel (14 items) ──
    { sku: "PC-LID-HOT-08", name: "Tutup Gelas Panas Sipper Lid Hitam 8oz", description: "Tutup sipper lid bahan PP tahan panas 8oz", cat: "PACKAGING_LID", type: "PURCHASED_COMPONENT", supply: "BUY", uom: "PCS", cost: "280", rop: "500", safety: "200", leadDays: 3, moq: "500", lotSize: "100", initialStock: "2000", initialWh: "RAW" },
    { sku: "PC-LID-HOT-12", name: "Tutup Gelas Panas Sipper Lid Hitam 12oz", description: "Tutup sipper lid bahan PP tahan panas 12oz", cat: "PACKAGING_LID", type: "PURCHASED_COMPONENT", supply: "BUY", uom: "PCS", cost: "320", rop: "800", safety: "300", leadDays: 3, moq: "1000", lotSize: "200", initialStock: "3500", initialWh: "RAW" },
    { sku: "PC-LID-COL-FLT", name: "Tutup Gelas Dingin Datar Flat Lid PET 98mm", description: "Tutup datar dengan lubang silang sedotan", cat: "PACKAGING_LID", type: "PURCHASED_COMPONENT", supply: "BUY", uom: "PCS", cost: "260", rop: "500", safety: "200", leadDays: 3, moq: "1000", lotSize: "200", initialStock: "2000", initialWh: "RAW" },
    { sku: "PC-LID-COL-DME", name: "Tutup Gelas Dingin Cembung Dome Lid PET 98mm", description: "Tutup cembung tinggi untuk minuman topping whipped cream", cat: "PACKAGING_LID", type: "PURCHASED_COMPONENT", supply: "BUY", uom: "PCS", cost: "310", rop: "400", safety: "150", leadDays: 3, moq: "500", lotSize: "200", initialStock: "1800", initialWh: "RAW" },
    { sku: "PC-LID-COL-STR", name: "Tutup Gelas Dingin Strawless Lid PET 98mm", description: "Tutup ergonomis langsung minum tanpa sedotan", cat: "PACKAGING_LID", type: "PURCHASED_COMPONENT", supply: "BUY", uom: "PCS", cost: "340", rop: "800", safety: "300", leadDays: 3, moq: "1000", lotSize: "500", initialStock: "4000", initialWh: "RAW" },
    { sku: "PC-CAP-ALU-28", name: "Tutup Ulir Aluminium Hitam Ulir 28mm", description: "Tutup botol aluminium ulir hitam leher 28mm dengan liner EPE", cat: "PACKAGING_LID", type: "PURCHASED_COMPONENT", supply: "BUY", uom: "PCS", cost: "650", rop: "500", safety: "200", leadDays: 4, moq: "500", lotSize: "250", initialStock: "2000", initialWh: "RAW" },
    { sku: "PC-CAP-PLS-28", name: "Tutup Ulir Plastik Tamper-Evident Segel 28mm", description: "Tutup botol plastik HDPE cincin segel pengaman", cat: "PACKAGING_LID", type: "PURCHASED_COMPONENT", supply: "BUY", uom: "PCS", cost: "280", rop: "1000", safety: "400", leadDays: 3, moq: "1000", lotSize: "500", initialStock: "5000", initialWh: "RAW" },
    { sku: "PC-CAN-END-202", name: "Tutup Kaleng Aluminium Easy Open End 202", description: "Tutup kaleng minuman can-seamer 202 B64", cat: "PACKAGING_LID", type: "PURCHASED_COMPONENT", supply: "BUY", uom: "PCS", cost: "750", rop: "500", safety: "200", leadDays: 5, moq: "500", lotSize: "250", initialStock: "1800", initialWh: "RAW" },
    { sku: "PC-STR-PLA-08", name: "Sedotan Kertas Ramah Lingkungan Hitam 8mm", description: "Biodegradable paper straw 8mm x 210mm bungkus steril", cat: "PACKAGING_LID", type: "PURCHASED_COMPONENT", supply: "BUY", uom: "PCS", cost: "180", rop: "1000", safety: "400", leadDays: 2, moq: "1000", lotSize: "500", initialStock: "4500", initialWh: "RAW" },
    { sku: "PC-STR-PLA-12", name: "Sedotan Kertas Boba Jumbo Cokelat 12mm", description: "Sedotan kertas jumbo untuk minuman jelly & boba", cat: "PACKAGING_LID", type: "PURCHASED_COMPONENT", supply: "BUY", uom: "PCS", cost: "240", rop: "300", safety: "100", leadDays: 3, moq: "500", lotSize: "200", initialStock: "1000", initialWh: "RAW" },
    { sku: "PC-SLV-KRAFT", name: "Pelindung Panas Cup Sleeve Karton Bergelombang", description: "Corrugated cup sleeve kraft untuk pelindung tangan panas", cat: "PACKAGING_LID", type: "PURCHASED_COMPONENT", supply: "BUY", uom: "PCS", cost: "210", rop: "500", safety: "200", leadDays: 2, moq: "1000", lotSize: "500", initialStock: "2500", initialWh: "RAW" },
    { sku: "PC-STR-PLST-IND", name: "Sedotan Plastik Runcing Steril Bungkus Satuan", description: "Individually wrapped pointed straw 6mm", cat: "PACKAGING_LID", type: "PURCHASED_COMPONENT", supply: "BUY", uom: "PCS", cost: "85", rop: "500", safety: "200", leadDays: 2, moq: "1000", lotSize: "500", initialStock: "2000", initialWh: "RAW" },
    { sku: "PC-TIE-CABLE", name: "Kawat Klip Pengikat Kantong Pastry Gold", description: "Metallic twist tie gold 10cm", cat: "PACKAGING_LID", type: "PURCHASED_COMPONENT", supply: "BUY", uom: "PCS", cost: "35", rop: "500", safety: "200", leadDays: 2, moq: "1000", lotSize: "500", initialStock: "2000", initialWh: "RAW" },
    { sku: "PC-SEA-INDUCT", name: "Segel Induksi Foil Aluminium Mulut Botol 28mm", description: "Induction seal liner hermetic leak-proof", cat: "PACKAGING_LID", type: "PURCHASED_COMPONENT", supply: "BUY", uom: "PCS", cost: "120", rop: "600", safety: "250", leadDays: 3, moq: "1000", lotSize: "500", initialStock: "3000", initialWh: "RAW" },

    // ── PURCHASED COMPONENTS: Kotak, Tas & Pouch Kopi (14 items) ──
    { sku: "PC-BOX-CAKE-SML", name: "Kotak Kue Kraft Window Jendela Mika 15x15cm", description: "Cake box kraft dengan jendela mika untuk 1-2 slice", cat: "PACKAGING_BOX", type: "PURCHASED_COMPONENT", supply: "BUY", uom: "PCS", cost: "2800", rop: "200", safety: "80", leadDays: 3, moq: "200", lotSize: "50", initialStock: "800", initialWh: "RAW" },
    { sku: "PC-BOX-CAKE-MED", name: "Kotak Kue Kraft Handle Jinjing 22x22cm", description: "Whole cake box jinjing kokoh untuk kue utuh 20cm", cat: "PACKAGING_BOX", type: "PURCHASED_COMPONENT", supply: "BUY", uom: "PCS", cost: "5500", rop: "100", safety: "40", leadDays: 4, moq: "100", lotSize: "50", initialStock: "400", initialWh: "RAW" },
    { sku: "PC-BOX-PAST-SGL", name: "Kotak Kraft Single Pastry Bento Box", description: "Bento box eco tebal untuk satuan croissant takeaway", cat: "PACKAGING_BOX", type: "PURCHASED_COMPONENT", supply: "BUY", uom: "PCS", cost: "1650", rop: "400", safety: "150", leadDays: 3, moq: "500", lotSize: "100", initialStock: "1500", initialWh: "RAW" },
    { sku: "PC-BOX-PAST-04", name: "Kotak Pastry Kraft Isi 4 Croissant", description: "Box kraft premium dengan kuncian lid untuk 4 pastry", cat: "PACKAGING_BOX", type: "PURCHASED_COMPONENT", supply: "BUY", uom: "PCS", cost: "3400", rop: "250", safety: "100", leadDays: 3, moq: "250", lotSize: "50", initialStock: "1000", initialWh: "RAW" },
    { sku: "PC-BOX-PAST-06", name: "Kotak Pastry Kraft Panjang Isi 6 Donat/Pastry", description: "Box kraft panjang ukuran 30x18cm untuk 6 pcs", cat: "PACKAGING_BOX", type: "PURCHASED_COMPONENT", supply: "BUY", uom: "PCS", cost: "4200", rop: "200", safety: "80", leadDays: 3, moq: "200", lotSize: "50", initialStock: "700", initialWh: "RAW" },
    { sku: "PC-BOX-DRIP-OUT", name: "Kotak Luar Karton Drip Bag Box Kraft", description: "Outer box cetak elegan untuk isi 5 sachet drip bag", cat: "PACKAGING_BOX", type: "PURCHASED_COMPONENT", supply: "BUY", uom: "PCS", cost: "3200", rop: "200", safety: "80", leadDays: 4, moq: "300", lotSize: "100", initialStock: "800", initialWh: "RAW" },
    { sku: "PC-BAG-PPR-SML", name: "Kantong Kertas Belanja Kraft Cokelat Small", description: "Paper bag kraft cokelat dasar lipat ukuran S", cat: "PACKAGING_BOX", type: "PURCHASED_COMPONENT", supply: "BUY", uom: "PCS", cost: "1200", rop: "500", safety: "200", leadDays: 2, moq: "500", lotSize: "100", initialStock: "2000", initialWh: "RAW" },
    { sku: "PC-BAG-PPR-MED", name: "Kantong Kertas Belanja Kraft Cokelat Medium", description: "Paper bag kraft cokelat dengan tali jinjing ukuran M", cat: "PACKAGING_BOX", type: "PURCHASED_COMPONENT", supply: "BUY", uom: "PCS", cost: "2100", rop: "400", safety: "150", leadDays: 2, moq: "500", lotSize: "100", initialStock: "1600", initialWh: "RAW" },
    { sku: "PC-BAG-PPR-LRG", name: "Kantong Kertas Belanja Kraft Cokelat Large", description: "Paper bag kraft tebal kapasitas 4 box kue ukuran L", cat: "PACKAGING_BOX", type: "PURCHASED_COMPONENT", supply: "BUY", uom: "PCS", cost: "3200", rop: "200", safety: "80", leadDays: 2, moq: "300", lotSize: "50", initialStock: "800", initialWh: "RAW" },
    { sku: "PC-BAG-DRK-02", name: "Karton Pegangan Cup Carrier Bawaan 2 Gelas", description: "Foldable cardboard 2-cup drink carrier", cat: "PACKAGING_BOX", type: "PURCHASED_COMPONENT", supply: "BUY", uom: "PCS", cost: "1400", rop: "300", safety: "100", leadDays: 2, moq: "500", lotSize: "100", initialStock: "1200", initialWh: "RAW" },
    { sku: "PC-BAG-DRK-04", name: "Karton Pegangan Cup Carrier Bawaan 4 Gelas", description: "Sturdy pulp 4-cup drink tray carrier", cat: "PACKAGING_BOX", type: "PURCHASED_COMPONENT", supply: "BUY", uom: "PCS", cost: "2200", rop: "200", safety: "80", leadDays: 2, moq: "300", lotSize: "100", initialStock: "800", initialWh: "RAW" },
    { sku: "PC-PCH-KFT-250", name: "Standing Pouch Kopi Kraft One-Way Valve 250g", description: "Pouch kertas kraft foil lining zipper & degassing valve", cat: "PACKAGING_BOX", type: "PURCHASED_COMPONENT", supply: "BUY", uom: "PCS", cost: "3800", rop: "300", safety: "100", leadDays: 4, moq: "300", lotSize: "100", initialStock: "1200", initialWh: "RAW" },
    { sku: "PC-PCH-BLK-500", name: "Standing Pouch Kopi Matte Black Valve Zipper 500g", description: "Matte black barrier foil pouch valve 500g", cat: "PACKAGING_BOX", type: "PURCHASED_COMPONENT", supply: "BUY", uom: "PCS", cost: "4800", rop: "200", safety: "80", leadDays: 4, moq: "200", lotSize: "100", initialStock: "700", initialWh: "RAW" },
    { sku: "PC-PCH-FOL-1000", name: "Gusset Pouch Kopi Aluminium Foil Valve 1kg", description: "Side gusset 1000g coffee bag with one-way degassing valve", cat: "PACKAGING_BOX", type: "PURCHASED_COMPONENT", supply: "BUY", uom: "PCS", cost: "6200", rop: "200", safety: "80", leadDays: 4, moq: "200", lotSize: "50", initialStock: "600", initialWh: "RAW" },

    // ── PURCHASED COMPONENTS: Label Stiker & Aksesoris (12 items) ──
    { sku: "PC-LBL-BOT-LAT", name: "Stiker Label Vinyl Botol Kopi Susu Aren 250ml", description: "Waterproof vinyl cut sticker label botol 250ml", cat: "PACKAGING_LABEL", type: "PURCHASED_COMPONENT", supply: "BUY", uom: "PCS", cost: "420", rop: "500", safety: "200", leadDays: 2, moq: "1000", lotSize: "500", initialStock: "2500", initialWh: "RAW" },
    { sku: "PC-LBL-BOT-1L", name: "Stiker Label Vinyl Botol Kopi Susu Aren 1 Liter", description: "Waterproof vinyl sticker label botol 1000ml", cat: "PACKAGING_LABEL", type: "PURCHASED_COMPONENT", supply: "BUY", uom: "PCS", cost: "650", rop: "300", safety: "150", leadDays: 2, moq: "500", lotSize: "250", initialStock: "1500", initialWh: "RAW" },
    { sku: "PC-LBL-BOT-CB", name: "Stiker Label Vinyl Botol Cold Brew Black", description: "Minimalist black label untuk cold brew murni", cat: "PACKAGING_LABEL", type: "PURCHASED_COMPONENT", supply: "BUY", uom: "PCS", cost: "420", rop: "300", safety: "100", leadDays: 2, moq: "500", lotSize: "250", initialStock: "1200", initialWh: "RAW" },
    { sku: "PC-LBL-BOT-OAT", name: "Stiker Label Vinyl Botol Cold Brew Oat Latte", description: "Waterproof vinyl sticker label cold brew oat", cat: "PACKAGING_LABEL", type: "PURCHASED_COMPONENT", supply: "BUY", uom: "PCS", cost: "420", rop: "300", safety: "100", leadDays: 2, moq: "500", lotSize: "250", initialStock: "1200", initialWh: "RAW" },
    { sku: "PC-LBL-BOT-MTC", name: "Stiker Label Vinyl Botol Uji Matcha Latte", description: "Waterproof green themed vinyl label botol matcha", cat: "PACKAGING_LABEL", type: "PURCHASED_COMPONENT", supply: "BUY", uom: "PCS", cost: "420", rop: "200", safety: "80", leadDays: 2, moq: "500", lotSize: "250", initialStock: "1000", initialWh: "RAW" },
    { sku: "PC-LBL-BOT-CHO", name: "Stiker Label Vinyl Botol Artisan Chocolate", description: "Brown vinyl sticker label botol dark chocolate", cat: "PACKAGING_LABEL", type: "PURCHASED_COMPONENT", supply: "BUY", uom: "PCS", cost: "420", rop: "200", safety: "80", leadDays: 2, moq: "500", lotSize: "250", initialStock: "1000", initialWh: "RAW" },
    { sku: "PC-LBL-CAN-CAS", name: "Shrink Sleeve Label Kaleng Cascara Soda 330ml", description: "Full body shrink sleeve printed label kaleng", cat: "PACKAGING_LABEL", type: "PURCHASED_COMPONENT", supply: "BUY", uom: "PCS", cost: "850", rop: "500", safety: "200", leadDays: 5, moq: "500", lotSize: "250", initialStock: "1800", initialWh: "RAW" },
    { sku: "PC-LBL-COF-250", name: "Stiker Kemasan Kopi Retail 250g Tasting Notes", description: "Customizable craft label dengan kolom varietas & notes", cat: "PACKAGING_LABEL", type: "PURCHASED_COMPONENT", supply: "BUY", uom: "PCS", cost: "350", rop: "400", safety: "150", leadDays: 2, moq: "1000", lotSize: "500", initialStock: "2000", initialWh: "RAW" },
    { sku: "PC-LBL-SEAL-BX", name: "Stiker Segel Keamanan Kotak Kue Halal / Brand", description: "Tamper proof paper seal sticker label", cat: "PACKAGING_LABEL", type: "PURCHASED_COMPONENT", supply: "BUY", uom: "PCS", cost: "180", rop: "600", safety: "200", leadDays: 2, moq: "1000", lotSize: "500", initialStock: "3000", initialWh: "RAW" },
    { sku: "PC-LBL-DRIP-BX", name: "Label Stiker Kotak Drip Bag Coffee Box", description: "Front & back sticker set untuk drip bag box", cat: "PACKAGING_LABEL", type: "PURCHASED_COMPONENT", supply: "BUY", uom: "PCS", cost: "550", rop: "200", safety: "80", leadDays: 3, moq: "500", lotSize: "250", initialStock: "800", initialWh: "RAW" },
    { sku: "PC-PPR-WAX-SHT", name: "Kertas Roti Baking Wax Paper Alas Burger/Pastry", description: "Greaseproof wax paper sheet 20x20cm perlembar", cat: "PACKAGING_LABEL", type: "PURCHASED_COMPONENT", supply: "BUY", uom: "PCS", cost: "95", rop: "1000", safety: "400", leadDays: 2, moq: "1000", lotSize: "500", initialStock: "5000", initialWh: "RAW" },
    { sku: "PC-RIB-SATIN-G", name: "Pita Satin Emas Hiasan Kotak Kado Hampers", description: "Gold satin ribbon 2cm roll per meter", cat: "PACKAGING_LABEL", type: "PURCHASED_COMPONENT", supply: "BUY", uom: "M", cost: "650", rop: "100", safety: "40", leadDays: 2, moq: "100", lotSize: "50", initialStock: "400", initialWh: "RAW" },

    // ── SUB-ASSEMBLIES: Kopi Sangrai & Ekstrak Base (16 items) ──
    { sku: "SA-ROA-ESPR-HOU", name: "Kopi Sangrai House Espresso Blend 70:30", description: "Campuran sangrai medium-dark Arabica Gayo & Robusta Dampit", cat: "SUB_COFFEE", type: "SUB_ASSEMBLY", supply: "MAKE", uom: "KG", cost: "145000", rop: "30", safety: "10", leadDays: 0, moq: "5", lotSize: "5", initialStock: "65", initialWh: "RAW" },
    { sku: "SA-ROA-ESPR-ARA", name: "Kopi Sangrai Heritage 100% Arabica Blend", description: "Blend Arabica Gayo Washed & Toraja Sapan medium roast", cat: "SUB_COFFEE", type: "SUB_ASSEMBLY", supply: "MAKE", uom: "KG", cost: "175000", rop: "20", safety: "5", leadDays: 0, moq: "5", lotSize: "5", initialStock: "40", initialWh: "RAW" },
    { sku: "SA-ROA-FLT-GAYO", name: "Kopi Sangrai Filter Roast Arabica Gayo Washed", description: "Light to medium roast untuk pour over V60", cat: "SUB_COFFEE", type: "SUB_ASSEMBLY", supply: "MAKE", uom: "KG", cost: "165000", rop: "15", safety: "5", leadDays: 0, moq: "3", lotSize: "3", initialStock: "30", initialWh: "RAW" },
    { sku: "SA-ROA-FLT-TORJ", name: "Kopi Sangrai Filter Roast Arabica Toraja Sapan", description: "Light roast fruity sweet note blueberry & dark plum", cat: "SUB_COFFEE", type: "SUB_ASSEMBLY", supply: "MAKE", uom: "KG", cost: "185000", rop: "15", safety: "5", leadDays: 0, moq: "3", lotSize: "3", initialStock: "25", initialWh: "RAW" },
    { sku: "SA-ROA-FLT-KINT", name: "Kopi Sangrai Filter Roast Bali Kintamani", description: "Filter roast citrus orange blossom notes", cat: "SUB_COFFEE", type: "SUB_ASSEMBLY", supply: "MAKE", uom: "KG", cost: "190000", rop: "10", safety: "3", leadDays: 0, moq: "3", lotSize: "3", initialStock: "20", initialWh: "RAW" },
    { sku: "SA-ROA-FLT-ETHI", name: "Kopi Sangrai Filter Roast Ethiopia Yirgacheffe", description: "Light roast jasmine tea, peach and bergamot", cat: "SUB_COFFEE", type: "SUB_ASSEMBLY", supply: "MAKE", uom: "KG", cost: "310000", rop: "8", safety: "2", leadDays: 0, moq: "2", lotSize: "2", initialStock: "15", initialWh: "RAW" },
    { sku: "SA-ROA-CB-CRSE", name: "Kopi Sangrai Giling Kasar Khusus Cold Brew", description: "Freshly roasted coarse grind blend khusus perendaman dingin", cat: "SUB_COFFEE", type: "SUB_ASSEMBLY", supply: "MAKE", uom: "KG", cost: "150000", rop: "20", safety: "5", leadDays: 0, moq: "5", lotSize: "5", initialStock: "45", initialWh: "RAW" },
    { sku: "SA-ROA-DRIP-GRD", name: "Kopi Sangrai Giling Medium Khusus Drip Bag", description: "Medium-fine grind blend khusus packing sachet drip", cat: "SUB_COFFEE", type: "SUB_ASSEMBLY", supply: "MAKE", uom: "KG", cost: "160000", rop: "15", safety: "5", leadDays: 0, moq: "5", lotSize: "5", initialStock: "35", initialWh: "RAW" },
    { sku: "SA-EXT-ESPRESSO", name: "Ekstrak Espresso Shot Konsentrat Kafein", description: "Espresso murni ekstraksi fresh untuk racikan botolan RTD", cat: "SUB_EXTRACT", type: "SUB_ASSEMBLY", supply: "MAKE", uom: "L", cost: "95000", rop: "15", safety: "5", leadDays: 0, moq: "5", lotSize: "5", initialStock: "25", initialWh: "RAW" },
    { sku: "SA-EXT-CLD-BREW", name: "Konsentrat Cold Brew Kopi Hitam Murni 1:4", description: "Ekstrak cold brew perendaman 18 jam TDS 6.5%", cat: "SUB_EXTRACT", type: "SUB_ASSEMBLY", supply: "MAKE", uom: "L", cost: "65000", rop: "25", safety: "10", leadDays: 0, moq: "10", lotSize: "5", initialStock: "50", initialWh: "RAW" },
    { sku: "SA-EXT-CASCARA", name: "Konsentrat Teh Ceri Kopi Cascara Dingin", description: "Seduhan dingin cascara ceri kopi konsentrat", cat: "SUB_EXTRACT", type: "SUB_ASSEMBLY", supply: "MAKE", uom: "L", cost: "42000", rop: "15", safety: "5", leadDays: 0, moq: "10", lotSize: "5", initialStock: "30", initialWh: "RAW" },
    { sku: "SA-EXT-AREN-SYR", name: "Sirup Aren Homemade Kental Masak Daun Pandan", description: "Rebusan gula aren nira murni daun pandan kental", cat: "SUB_EXTRACT", type: "SUB_ASSEMBLY", supply: "MAKE", uom: "L", cost: "38000", rop: "30", safety: "10", leadDays: 0, moq: "10", lotSize: "5", initialStock: "75", initialWh: "RAW" },
    { sku: "SA-EXT-SIMP-SYR", name: "Sirup Gula Cair Murni Standar Kafe 1:1", description: "Simple syrup 50:50 air dan gula putih rafinasi", cat: "SUB_EXTRACT", type: "SUB_ASSEMBLY", supply: "MAKE", uom: "L", cost: "14000", rop: "30", safety: "10", leadDays: 0, moq: "10", lotSize: "5", initialStock: "60", initialWh: "RAW" },
    { sku: "SA-EXT-CARAM-SC", name: "Saus Homemade Salted Caramel Mentega Gurih", description: "Cooked caramelized sugar with French butter and sea salt", cat: "SUB_EXTRACT", type: "SUB_ASSEMBLY", supply: "MAKE", uom: "KG", cost: "68000", rop: "10", safety: "3", leadDays: 0, moq: "5", lotSize: "2", initialStock: "20", initialWh: "RAW" },
    { sku: "SA-EXT-CHOC-GAN", name: "Saus Cokelat Ganache Couverture Cair", description: "Dark couverture chocolate melted with fresh dairy cream", cat: "SUB_EXTRACT", type: "SUB_ASSEMBLY", supply: "MAKE", uom: "KG", cost: "92000", rop: "10", safety: "3", leadDays: 0, moq: "5", lotSize: "2", initialStock: "22", initialWh: "RAW" },
    { sku: "SA-EXT-MTC-BASE", name: "Konsentrat Uji Matcha Whisked Base Cair", description: "Whisked ceremonial matcha paste siap pakai", cat: "SUB_EXTRACT", type: "SUB_ASSEMBLY", supply: "MAKE", uom: "L", cost: "185000", rop: "8", safety: "2", leadDays: 0, moq: "3", lotSize: "1", initialStock: "12", initialWh: "RAW" },

    // ── SUB-ASSEMBLIES: Pastry, Adonan & Krim (14 items) ──
    { sku: "SA-BAK-CRS-DGH", name: "Adonan Lembaran Croissant Laminated Dough Sheet", description: "French laminated pastry dough sheet 27 lapis mentega", cat: "SUB_DOUGH", type: "SUB_ASSEMBLY", supply: "MAKE", uom: "KG", cost: "78000", rop: "20", safety: "5", leadDays: 0, moq: "5", lotSize: "5", initialStock: "35", initialWh: "RAW" },
    { sku: "SA-BAK-DAN-DGH", name: "Adonan Roti Denmark Danish Pastry Laminated Sheet", description: "Sweet yeast laminated dough for fruit & cheese danishes", cat: "SUB_DOUGH", type: "SUB_ASSEMBLY", supply: "MAKE", uom: "KG", cost: "72000", rop: "15", safety: "5", leadDays: 0, moq: "5", lotSize: "5", initialStock: "25", initialWh: "RAW" },
    { sku: "SA-BAK-BRI-DGH", name: "Adonan Roti Manis Brioche French Butter", description: "Enriched buttery dough for brioche buns & loaves", cat: "SUB_DOUGH", type: "SUB_ASSEMBLY", supply: "MAKE", uom: "KG", cost: "58000", rop: "15", safety: "5", leadDays: 0, moq: "5", lotSize: "5", initialStock: "30", initialWh: "RAW" },
    { sku: "SA-BAK-CKI-CHOC", name: "Porsi Adonan Kukis Cokelat Chip Siap Panggang", description: "Pre-portioned 100g dough balls with dark chocolate chips", cat: "SUB_DOUGH", type: "SUB_ASSEMBLY", supply: "MAKE", uom: "KG", cost: "48000", rop: "20", safety: "5", leadDays: 0, moq: "5", lotSize: "5", initialStock: "40", initialWh: "RAW" },
    { sku: "SA-BAK-CKI-REDV", name: "Porsi Adonan Kukis Red Velvet White Choc", description: "Pre-portioned red velvet dough with white chocolate chunks", cat: "SUB_DOUGH", type: "SUB_ASSEMBLY", supply: "MAKE", uom: "KG", cost: "54000", rop: "15", safety: "5", leadDays: 0, moq: "5", lotSize: "5", initialStock: "30", initialWh: "RAW" },
    { sku: "SA-BAK-BRW-BAT", name: "Adonan Mentah Fudgy Chocolate Brownie", description: "Melted couverture chocolate and Dutch cocoa brownie batter", cat: "SUB_DOUGH", type: "SUB_ASSEMBLY", supply: "MAKE", uom: "KG", cost: "65000", rop: "15", safety: "5", leadDays: 0, moq: "5", lotSize: "5", initialStock: "25", initialWh: "RAW" },
    { sku: "SA-BAK-BSQ-BAT", name: "Adonan Mentah Basque Burnt Cheesecake Kental", description: "Cream cheese, fresh cream, eggs and vanilla batter", cat: "SUB_DOUGH", type: "SUB_ASSEMBLY", supply: "MAKE", uom: "KG", cost: "88000", rop: "12", safety: "4", leadDays: 0, moq: "4", lotSize: "2", initialStock: "20", initialWh: "RAW" },
    { sku: "SA-BAK-NY-BAT", name: "Adonan Mentah New York Baked Cheesecake", description: "Classic dense cream cheese batter with lemon zest", cat: "SUB_DOUGH", type: "SUB_ASSEMBLY", supply: "MAKE", uom: "KG", cost: "92000", rop: "10", safety: "3", leadDays: 0, moq: "4", lotSize: "2", initialStock: "16", initialWh: "RAW" },
    { sku: "SA-BAK-BAN-BAT", name: "Adonan Mentah Banana Bread Brown Sugar Walnut", description: "Mashed ripe Cavendish bananas with cinnamon & walnuts", cat: "SUB_DOUGH", type: "SUB_ASSEMBLY", supply: "MAKE", uom: "KG", cost: "42000", rop: "15", safety: "5", leadDays: 0, moq: "5", lotSize: "5", initialStock: "30", initialWh: "RAW" },
    { sku: "SA-BAK-CUS-CRM", name: "Krim Isian Pastry Vanilla Custard Pastry Cream", description: "Cooked milk, egg yolk and vanilla bean pastry cream", cat: "SUB_DOUGH", type: "SUB_ASSEMBLY", supply: "MAKE", uom: "KG", cost: "45000", rop: "15", safety: "5", leadDays: 0, moq: "5", lotSize: "2", initialStock: "25", initialWh: "RAW" },
    { sku: "SA-BAK-ALM-FRG", name: "Krim Pasta Almond Frangipane Isian Almond Croissant", description: "Almond flour, butter, sugar and rum flavoring cream", cat: "SUB_DOUGH", type: "SUB_ASSEMBLY", supply: "MAKE", uom: "KG", cost: "78000", rop: "10", safety: "3", leadDays: 0, moq: "3", lotSize: "1", initialStock: "18", initialWh: "RAW" },
    { sku: "SA-BAK-CHE-FRO", name: "Krim Oles Frosting Cream Cheese Vanilla", description: "Whipped cream cheese with butter & powdered sugar", cat: "SUB_DOUGH", type: "SUB_ASSEMBLY", supply: "MAKE", uom: "KG", cost: "62000", rop: "10", safety: "3", leadDays: 0, moq: "3", lotSize: "1", initialStock: "15", initialWh: "RAW" },
    { sku: "SA-BAK-CIN-FIL", name: "Isian Gula Palem Kayu Manis Cinnamon Roll Filling", description: "Soft brown sugar, cinnamon spice and butter spread", cat: "SUB_DOUGH", type: "SUB_ASSEMBLY", supply: "MAKE", uom: "KG", cost: "38000", rop: "10", safety: "3", leadDays: 0, moq: "3", lotSize: "1", initialStock: "20", initialWh: "RAW" },
    { sku: "SA-BAK-STR-CMP", name: "Selai Buah Stroberi Asli Homemade Compote", description: "Simmered fresh strawberries with lemon juice and sugar", cat: "SUB_DOUGH", type: "SUB_ASSEMBLY", supply: "MAKE", uom: "KG", cost: "48000", rop: "8", safety: "2", leadDays: 0, moq: "3", lotSize: "1", initialStock: "15", initialWh: "RAW" },

    // ── FINISHED GOODS: Minuman Botol Siap Saji (RTD) (18 items) ──
    { sku: "FG-RTD-LATTE-250", name: "Kopi Susu Aren Botol 250ml Ready-To-Drink", description: "Signature iced latte gula aren botol kaca 250ml", cat: "FG_BEVERAGE", type: "FINISHED_GOODS", supply: "MAKE", uom: "BTL", cost: "9800", rop: "50", safety: "20", leadDays: 0, moq: "24", lotSize: "12", initialStock: "150", initialWh: "FG" },
    { sku: "FG-RTD-LATTE-1L", name: "Kopi Susu Aren Literan Botol 1000ml Family Pack", description: "Signature iced latte 1 Liter botol jerigen untuk keluarga", cat: "FG_BEVERAGE", type: "FINISHED_GOODS", supply: "MAKE", uom: "BTL", cost: "34500", rop: "30", safety: "10", leadDays: 0, moq: "12", lotSize: "6", initialStock: "80", initialWh: "FG" },
    { sku: "FG-RTD-CLDBRW-250", name: "Cold Brew Black Coffee Botol Kaca 250ml", description: "Kopi seduh dingin 18 jam botol amber tanpa gula", cat: "FG_BEVERAGE", type: "FINISHED_GOODS", supply: "MAKE", uom: "BTL", cost: "8500", rop: "30", safety: "10", leadDays: 0, moq: "12", lotSize: "6", initialStock: "90", initialWh: "FG" },
    { sku: "FG-RTD-CBOAT-250", name: "Cold Brew Oat Milk Latte Botol Kaca 250ml", description: "Cold brew concentrate dipadu susu gandum oatmilk", cat: "FG_BEVERAGE", type: "FINISHED_GOODS", supply: "MAKE", uom: "BTL", cost: "14500", rop: "30", safety: "10", leadDays: 0, moq: "12", lotSize: "6", initialStock: "75", initialWh: "FG" },
    { sku: "FG-RTD-MATCHA-250", name: "Uji Matcha Latte Creamy Botol 250ml", description: "Matcha Uji Kyoto asli dipadu fresh milk dingin", cat: "FG_BEVERAGE", type: "FINISHED_GOODS", supply: "MAKE", uom: "BTL", cost: "12500", rop: "25", safety: "10", leadDays: 0, moq: "12", lotSize: "6", initialStock: "60", initialWh: "FG" },
    { sku: "FG-RTD-HOJICH-250", name: "Hojicha Roasted Tea Latte Botol 250ml", description: "Teh hijau panggang Kyoto latte botol 250ml", cat: "FG_BEVERAGE", type: "FINISHED_GOODS", supply: "MAKE", uom: "BTL", cost: "11500", rop: "20", safety: "5", leadDays: 0, moq: "12", lotSize: "6", initialStock: "50", initialWh: "FG" },
    { sku: "FG-RTD-CHOCO-250", name: "Artisan Dark Chocolate Drink Botol 250ml", description: "Belgian dark chocolate couverture cair kental", cat: "FG_BEVERAGE", type: "FINISHED_GOODS", supply: "MAKE", uom: "BTL", cost: "11000", rop: "25", safety: "10", leadDays: 0, moq: "12", lotSize: "6", initialStock: "70", initialWh: "FG" },
    { sku: "FG-RTD-EARL-250", name: "Earl Grey Royal Milk Tea Botol 250ml", description: "Teh bergamot seduh lambat dipadu fresh milk creamy", cat: "FG_BEVERAGE", type: "FINISHED_GOODS", supply: "MAKE", uom: "BTL", cost: "9500", rop: "20", safety: "5", leadDays: 0, moq: "12", lotSize: "6", initialStock: "55", initialWh: "FG" },
    { sku: "FG-RTD-CARAM-250", name: "Salted Caramel Macchiato Botol 250ml", description: "Espresso, fresh milk dan saus salted caramel homemade", cat: "FG_BEVERAGE", type: "FINISHED_GOODS", supply: "MAKE", uom: "BTL", cost: "12000", rop: "25", safety: "10", leadDays: 0, moq: "12", lotSize: "6", initialStock: "65", initialWh: "FG" },
    { sku: "FG-RTD-MOCHA-250", name: "Dark Mocha Caffe Latte Botol 250ml", description: "Espresso shot dipadu couverture chocolate & susu segar", cat: "FG_BEVERAGE", type: "FINISHED_GOODS", supply: "MAKE", uom: "BTL", cost: "12500", rop: "20", safety: "5", leadDays: 0, moq: "12", lotSize: "6", initialStock: "50", initialWh: "FG" },
    { sku: "FG-RTD-VANIL-250", name: "French Vanilla Iced Latte Botol 250ml", description: "Espresso latte dengan sirup natural bourbon vanilla", cat: "FG_BEVERAGE", type: "FINISHED_GOODS", supply: "MAKE", uom: "BTL", cost: "11500", rop: "20", safety: "5", leadDays: 0, moq: "12", lotSize: "6", initialStock: "45", initialWh: "FG" },
    { sku: "FG-RTD-HAZEL-250", name: "Roasted Hazelnut Iced Latte Botol 250ml", description: "Espresso latte dengan aroma kacang hazelnut panggang", cat: "FG_BEVERAGE", type: "FINISHED_GOODS", supply: "MAKE", uom: "BTL", cost: "11500", rop: "20", safety: "5", leadDays: 0, moq: "12", lotSize: "6", initialStock: "45", initialWh: "FG" },
    { sku: "FG-CAN-CASC-330", name: "Sparkling Cascara Lemon Soda Kaleng 330ml", description: "Minuman soda kaleng dingin berbahan kulit ceri kopi & lemon", cat: "FG_BEVERAGE", type: "FINISHED_GOODS", supply: "MAKE", uom: "CAN", cost: "8200", rop: "40", safety: "15", leadDays: 0, moq: "24", lotSize: "12", initialStock: "120", initialWh: "FG" },
    { sku: "FG-CAN-COLD-330", name: "Nitro Cold Brew Black Coffee Kaleng 330ml", description: "Cold brew kaleng dengan gas nitrogen velvety crema", cat: "FG_BEVERAGE", type: "FINISHED_GOODS", supply: "MAKE", uom: "CAN", cost: "9800", rop: "30", safety: "10", leadDays: 0, moq: "24", lotSize: "12", initialStock: "90", initialWh: "FG" },
    { sku: "FG-CAN-PEAC-330", name: "Sparkling White Peach Iced Tea Kaleng 330ml", description: "Teh soda peach putih bersoda segar dalam kaleng", cat: "FG_BEVERAGE", type: "FINISHED_GOODS", supply: "MAKE", uom: "CAN", cost: "7800", rop: "30", safety: "10", leadDays: 0, moq: "24", lotSize: "12", initialStock: "80", initialWh: "FG" },
    { sku: "FG-CAN-LYCH-330", name: "Sparkling Lychee Jasmine Tea Kaleng 330ml", description: "Teh melati soda rasa leci tropis kaleng 330ml", cat: "FG_BEVERAGE", type: "FINISHED_GOODS", supply: "MAKE", uom: "CAN", cost: "7800", rop: "30", safety: "10", leadDays: 0, moq: "24", lotSize: "12", initialStock: "80", initialWh: "FG" },
    { sku: "FG-RTD-MTC-OAT-1L", name: "Uji Matcha Oat Milk Botol 1 Liter", description: "Uji matcha latte oatmilk botol 1 Liter family size", cat: "FG_BEVERAGE", type: "FINISHED_GOODS", supply: "MAKE", uom: "BTL", cost: "48000", rop: "15", safety: "5", leadDays: 0, moq: "6", lotSize: "6", initialStock: "35", initialWh: "FG" },
    { sku: "FG-RTD-CHOCO-1L", name: "Artisan Dark Chocolate Botol 1 Liter", description: "Dark chocolate drink botol 1 Liter kental", cat: "FG_BEVERAGE", type: "FINISHED_GOODS", supply: "MAKE", uom: "BTL", cost: "38000", rop: "15", safety: "5", leadDays: 0, moq: "6", lotSize: "6", initialStock: "40", initialWh: "FG" },

    // ── FINISHED GOODS: Kopi Retail Pouch & Box (14 items) ──
    { sku: "FG-RET-HOU-250B", name: "Kopi Biji House Espresso Blend Pouch 250g", description: "Biji kopi sangrai kemasan retail kraft valve 250g", cat: "FG_RETAIL_COFFEE", type: "FINISHED_GOODS", supply: "MAKE", uom: "PACK", cost: "42000", rop: "20", safety: "5", leadDays: 0, moq: "10", lotSize: "5", initialStock: "50", initialWh: "FG" },
    { sku: "FG-RET-HOU-250G", name: "Kopi Bubuk House Espresso Blend Pouch 250g", description: "Kopi bubuk giling halus kemasan retail kraft 250g", cat: "FG_RETAIL_COFFEE", type: "FINISHED_GOODS", supply: "MAKE", uom: "PACK", cost: "42000", rop: "20", safety: "5", leadDays: 0, moq: "10", lotSize: "5", initialStock: "45", initialWh: "FG" },
    { sku: "FG-RET-HOU-1KGB", name: "Kopi Biji House Espresso Blend Pouch 1kg", description: "Kemasan horeca 1000g biji kopi sangrai", cat: "FG_RETAIL_COFFEE", type: "FINISHED_GOODS", supply: "MAKE", uom: "PACK", cost: "152000", rop: "15", safety: "5", leadDays: 0, moq: "5", lotSize: "5", initialStock: "30", initialWh: "FG" },
    { sku: "FG-RET-ARA-250B", name: "Kopi Biji Heritage 100% Arabica Pouch 250g", description: "100% arabica specialty blend pouch 250g", cat: "FG_RETAIL_COFFEE", type: "FINISHED_GOODS", supply: "MAKE", uom: "PACK", cost: "52000", rop: "15", safety: "5", leadDays: 0, moq: "10", lotSize: "5", initialStock: "35", initialWh: "FG" },
    { sku: "FG-RET-GAYO-250", name: "Kopi Biji Single Origin Arabica Gayo Washed 250g", description: "Single origin specialty roast Gayo washed 250g", cat: "FG_RETAIL_COFFEE", type: "FINISHED_GOODS", supply: "MAKE", uom: "PACK", cost: "48000", rop: "15", safety: "5", leadDays: 0, moq: "10", lotSize: "5", initialStock: "40", initialWh: "FG" },
    { sku: "FG-RET-TORJ-250", name: "Kopi Biji Single Origin Arabica Toraja Sapan 250g", description: "Single origin specialty roast Toraja Sapan 250g", cat: "FG_RETAIL_COFFEE", type: "FINISHED_GOODS", supply: "MAKE", uom: "PACK", cost: "55000", rop: "15", safety: "5", leadDays: 0, moq: "10", lotSize: "5", initialStock: "30", initialWh: "FG" },
    { sku: "FG-RET-KINT-250", name: "Kopi Biji Single Origin Arabica Bali Kintamani 250g", description: "Single origin specialty roast Bali Kintamani 250g", cat: "FG_RETAIL_COFFEE", type: "FINISHED_GOODS", supply: "MAKE", uom: "PACK", cost: "56000", rop: "12", safety: "4", leadDays: 0, moq: "10", lotSize: "5", initialStock: "25", initialWh: "FG" },
    { sku: "FG-RET-FLOR-250", name: "Kopi Biji Single Origin Arabica Flores Bajawa 250g", description: "Single origin specialty roast Flores Bajawa 250g", cat: "FG_RETAIL_COFFEE", type: "FINISHED_GOODS", supply: "MAKE", uom: "PACK", cost: "49000", rop: "12", safety: "4", leadDays: 0, moq: "10", lotSize: "5", initialStock: "25", initialWh: "FG" },
    { sku: "FG-RET-ETHI-250", name: "Kopi Biji Single Origin Ethiopia Yirgacheffe 250g", description: "Exotic imported floral specialty light roast 250g", cat: "FG_RETAIL_COFFEE", type: "FINISHED_GOODS", supply: "MAKE", uom: "PACK", cost: "85000", rop: "10", safety: "3", leadDays: 0, moq: "6", lotSize: "3", initialStock: "20", initialWh: "FG" },
    { sku: "FG-RET-COLM-250", name: "Biji Kopi Single Origin Colombia Supremo 250g", description: "Imported Colombia Supremo medium roast 250g", cat: "FG_RETAIL_COFFEE", type: "FINISHED_GOODS", supply: "MAKE", uom: "PACK", cost: "65000", rop: "10", safety: "3", leadDays: 0, moq: "6", lotSize: "3", initialStock: "20", initialWh: "FG" },
    { sku: "FG-RET-DRIP-HOU", name: "Drip Bag Coffee Box House Blend (Isi 5 Sachet)", description: "Kotak kemasan isi 5 sachet drip bag kopi filter siap seduh", cat: "FG_RETAIL_COFFEE", type: "FINISHED_GOODS", supply: "MAKE", uom: "BOX", cost: "32000", rop: "25", safety: "10", leadDays: 0, moq: "10", lotSize: "5", initialStock: "60", initialWh: "FG" },
    { sku: "FG-RET-DRIP-SGL", name: "Drip Bag Coffee Box Single Origin Gayo (Isi 5 Sachet)", description: "Kotak isi 5 sachet drip bag kopi Arabika Gayo Washed", cat: "FG_RETAIL_COFFEE", type: "FINISHED_GOODS", supply: "MAKE", uom: "BOX", cost: "36000", rop: "20", safety: "8", leadDays: 0, moq: "10", lotSize: "5", initialStock: "45", initialWh: "FG" },
    { sku: "FG-RET-DRIP-MIX", name: "Drip Bag Coffee Box Discovery Mix (Isi 5 Sachet)", description: "Kotak isi 5 sachet campuran origin (Gayo, Toraja, Bali, Ijen, Flores)", cat: "FG_RETAIL_COFFEE", type: "FINISHED_GOODS", supply: "MAKE", uom: "BOX", cost: "38000", rop: "20", safety: "8", leadDays: 0, moq: "10", lotSize: "5", initialStock: "50", initialWh: "FG" },
    { sku: "FG-RET-CB-BAG", name: "Cold Brew At Home Brew-Bag Box (Isi 3 Kantong)", description: "Kotak celup cold brew praktis untuk 1 liter air per kantong", cat: "FG_RETAIL_COFFEE", type: "FINISHED_GOODS", supply: "MAKE", uom: "BOX", cost: "42000", rop: "15", safety: "5", leadDays: 0, moq: "10", lotSize: "5", initialStock: "35", initialWh: "FG" },

    // ── FINISHED GOODS: Fresh Bakery, Croissant & Cake (20 items) ──
    { sku: "FG-BAK-CRS-BUT", name: "Classic French Butter Croissant", description: "Croissant renyah berlapis dengan French butter murni", cat: "FG_BAKERY_PASTRY", type: "FINISHED_GOODS", supply: "MAKE", uom: "PCS", cost: "11200", rop: "40", safety: "15", leadDays: 0, moq: "24", lotSize: "12", initialStock: "80", initialWh: "FG" },
    { sku: "FG-BAK-CRS-CHO", name: "Pain au Chocolat (Chocolate Croissant)", description: "Croissant gulung dengan 2 batang Belgian dark chocolate baton", cat: "FG_BAKERY_PASTRY", type: "FINISHED_GOODS", supply: "MAKE", uom: "PCS", cost: "14500", rop: "35", safety: "10", leadDays: 0, moq: "24", lotSize: "12", initialStock: "70", initialWh: "FG" },
    { sku: "FG-BAK-CRS-ALM", name: "Twice-Baked Almond Frangipane Croissant", description: "Croissant panggang dua kali dengan krim almond & slice almond", cat: "FG_BAKERY_PASTRY", type: "FINISHED_GOODS", supply: "MAKE", uom: "PCS", cost: "18500", rop: "25", safety: "10", leadDays: 0, moq: "12", lotSize: "6", initialStock: "50", initialWh: "FG" },
    { sku: "FG-BAK-CRS-CHE", name: "Triple Cheese Cheddar Mozzarella Croissant", description: "Croissant gurih isi lelehan keju mozzarella & red cheddar", cat: "FG_BAKERY_PASTRY", type: "FINISHED_GOODS", supply: "MAKE", uom: "PCS", cost: "16500", rop: "20", safety: "5", leadDays: 0, moq: "12", lotSize: "6", initialStock: "45", initialWh: "FG" },
    { sku: "FG-BAK-KOU-AMN", name: "Kouign-Amann Brittany Caramelized Pastry", description: "Pastry khas Brittany Prancis dengan kerak karamel renyah", cat: "FG_BAKERY_PASTRY", type: "FINISHED_GOODS", supply: "MAKE", uom: "PCS", cost: "13500", rop: "20", safety: "5", leadDays: 0, moq: "12", lotSize: "6", initialStock: "40", initialWh: "FG" },
    { sku: "FG-BAK-CIN-ROL", name: "Cinnamon Roll Glaze Cream Cheese Frosting", description: "Roti gulung kayu manis lembut dengan topping cream cheese", cat: "FG_BAKERY_PASTRY", type: "FINISHED_GOODS", supply: "MAKE", uom: "PCS", cost: "12800", rop: "30", safety: "10", leadDays: 0, moq: "16", lotSize: "8", initialStock: "60", initialWh: "FG" },
    { sku: "FG-BAK-DAN-STR", name: "Strawberry Custard Danish Pastry", description: "Danish pastry isi vanilla custard dan selai stroberi segar", cat: "FG_BAKERY_PASTRY", type: "FINISHED_GOODS", supply: "MAKE", uom: "PCS", cost: "15500", rop: "20", safety: "5", leadDays: 0, moq: "12", lotSize: "6", initialStock: "40", initialWh: "FG" },
    { sku: "FG-BAK-DAN-PEA", name: "Peach Frangipane Danish Pastry", description: "Danish pastry isi krim almond dan irisan buah peach manis", cat: "FG_BAKERY_PASTRY", type: "FINISHED_GOODS", supply: "MAKE", uom: "PCS", cost: "16000", rop: "15", safety: "5", leadDays: 0, moq: "12", lotSize: "6", initialStock: "35", initialWh: "FG" },
    { sku: "FG-BAK-CKI-DKC", name: "Classic Double Dark Chocolate Chip Cookie", description: "Kukis NYC style tebal renyah luar lembut dalam dark choc", cat: "FG_BAKERY_PASTRY", type: "FINISHED_GOODS", supply: "MAKE", uom: "PCS", cost: "10500", rop: "30", safety: "10", leadDays: 0, moq: "20", lotSize: "10", initialStock: "60", initialWh: "FG" },
    { sku: "FG-BAK-CKI-RDV", name: "Red Velvet Cream Cheese Cookie", description: "Kukis red velvet lembut dengan isian cream cheese leleh", cat: "FG_BAKERY_PASTRY", type: "FINISHED_GOODS", supply: "MAKE", uom: "PCS", cost: "12500", rop: "25", safety: "10", leadDays: 0, moq: "20", lotSize: "10", initialStock: "50", initialWh: "FG" },
    { sku: "FG-BAK-CKI-ALM", name: "Roasted Almond Sea Salt Brown Butter Cookie", description: "Kukis brown butter wangi kacang almond dan taburan sea salt", cat: "FG_BAKERY_PASTRY", type: "FINISHED_GOODS", supply: "MAKE", uom: "PCS", cost: "11500", rop: "20", safety: "5", leadDays: 0, moq: "20", lotSize: "10", initialStock: "45", initialWh: "FG" },
    { sku: "FG-BAK-BRW-SLC", name: "Fudgy Belgian Dark Chocolate Brownie Slice", description: "Brownie panggang cokelat pekat Callebaut legit", cat: "FG_BAKERY_PASTRY", type: "FINISHED_GOODS", supply: "MAKE", uom: "PCS", cost: "12000", rop: "25", safety: "10", leadDays: 0, moq: "16", lotSize: "8", initialStock: "55", initialWh: "FG" },
    { sku: "FG-BAK-BSQ-SLC", name: "Basque Burnt Cheesecake Slice", description: "Potongan cheesecake panggang karamel gosong lembut lumer", cat: "FG_BAKERY_PASTRY", type: "FINISHED_GOODS", supply: "MAKE", uom: "PCS", cost: "16500", rop: "20", safety: "8", leadDays: 0, moq: "10", lotSize: "5", initialStock: "40", initialWh: "FG" },
    { sku: "FG-BAK-BSQ-WHL", name: "Basque Burnt Cheesecake Whole 20cm", description: "Kue utuh Basque cheesecake diameter 20cm (8-10 porsi)", cat: "FG_BAKERY_PASTRY", type: "FINISHED_GOODS", supply: "MAKE", uom: "PCS", cost: "125000", rop: "5", safety: "2", leadDays: 0, moq: "2", lotSize: "1", initialStock: "10", initialWh: "FG" },
    { sku: "FG-BAK-NYC-SLC", name: "New York Style Baked Cheesecake Slice", description: "Cheesecake padat klasik dengan alas biskuit mentega", cat: "FG_BAKERY_PASTRY", type: "FINISHED_GOODS", supply: "MAKE", uom: "PCS", cost: "17500", rop: "15", safety: "5", leadDays: 0, moq: "10", lotSize: "5", initialStock: "30", initialWh: "FG" },
    { sku: "FG-BAK-BAN-BRD", name: "Banana Walnut Caramel Bread Slice", description: "Bolu pisang panggang wangi kayu manis taburan kenari", cat: "FG_BAKERY_PASTRY", type: "FINISHED_GOODS", supply: "MAKE", uom: "PCS", cost: "8500", rop: "25", safety: "10", leadDays: 0, moq: "12", lotSize: "6", initialStock: "50", initialWh: "FG" },
    { sku: "FG-BAK-LEM-CAK", name: "Glazed Lemon Drizzle Poppyseed Pound Cake Slice", description: "Kue pon lemon segar dengan glasir gula asam manis", cat: "FG_BAKERY_PASTRY", type: "FINISHED_GOODS", supply: "MAKE", uom: "PCS", cost: "9500", rop: "20", safety: "5", leadDays: 0, moq: "12", lotSize: "6", initialStock: "35", initialWh: "FG" },
    { sku: "FG-BAK-CAR-CAK", name: "Spiced Carrot Cake with Cream Cheese Frosting", description: "Kue wortel rempah lembut dengan olesan keju krim", cat: "FG_BAKERY_PASTRY", type: "FINISHED_GOODS", supply: "MAKE", uom: "PCS", cost: "14500", rop: "15", safety: "5", leadDays: 0, moq: "10", lotSize: "5", initialStock: "30", initialWh: "FG" },
    { sku: "FG-BAK-ECL-CHO", name: "Dark Chocolate Eclair Pastry Cream", description: "Choux pastry panjang isi vla vanilla celup cokelat ganache", cat: "FG_BAKERY_PASTRY", type: "FINISHED_GOODS", supply: "MAKE", uom: "PCS", cost: "13500", rop: "20", safety: "5", leadDays: 0, moq: "12", lotSize: "6", initialStock: "40", initialWh: "FG" },
    { sku: "FG-BAK-SCON-BUT", name: "English Buttermilk Scone Clotted Cream", description: "Scone mentega tradisional disajikan dengan selai & krim", cat: "FG_BAKERY_PASTRY", type: "FINISHED_GOODS", supply: "MAKE", uom: "PCS", cost: "9500", rop: "25", safety: "10", leadDays: 0, moq: "16", lotSize: "8", initialStock: "45", initialWh: "FG" },

    // ── CONSUMABLES: Bahan Pembersih & Sanitasi Barista (10 items) ──
    { sku: "CS-CLN-CAFIZA", name: "Bubuk Pembersih Mesin Espresso Urnex Cafiza 900g", description: "Backflush detergent khusus group head mesin kopi komersial", cat: "CONSUMABLE_CAFE", type: "CONSUMABLE", supply: "BUY", uom: "BTL", cost: "175000", rop: "10", safety: "3", leadDays: 3, moq: "6", lotSize: "3", initialStock: "25", initialWh: "RAW" },
    { sku: "CS-CLN-RINZA", name: "Cairan Pembersih Steam Wand Milk Rinza 1L", description: "Alkaline milk residue cleaner untuk steam wand & auto-frother", cat: "CONSUMABLE_CAFE", type: "CONSUMABLE", supply: "BUY", uom: "BTL", cost: "195000", rop: "8", safety: "2", leadDays: 3, moq: "6", lotSize: "3", initialStock: "20", initialWh: "RAW" },
    { sku: "CS-CLN-GRIND", name: "Butiran Pembersih Grinder Kopi Grindz 430g", description: "All-natural gluten-free coffee grinder cleaning pellets", cat: "CONSUMABLE_CAFE", type: "CONSUMABLE", supply: "BUY", uom: "BTL", cost: "220000", rop: "6", safety: "2", leadDays: 4, moq: "6", lotSize: "2", initialStock: "15", initialWh: "RAW" },
    { sku: "CS-CLN-SAN-SP", name: "Cairan Sanitizer Semprot Food Grade 5L", description: "Alcohol 70% food contact surface sanitizer jerigen 5L", cat: "CONSUMABLE_CAFE", type: "CONSUMABLE", supply: "BUY", uom: "CAN", cost: "145000", rop: "5", safety: "2", leadDays: 2, moq: "4", lotSize: "2", initialStock: "12", initialWh: "RAW" },
    { sku: "CS-EQP-GLV-M", name: "Sarung Tangan Nitril Food Grade Ukuran M (100 Pcs)", description: "Powder-free black nitrile food handling gloves size M", cat: "CONSUMABLE_CAFE", type: "CONSUMABLE", supply: "BUY", uom: "BOX", cost: "75000", rop: "15", safety: "5", leadDays: 2, moq: "10", lotSize: "5", initialStock: "35", initialWh: "RAW" },
    { sku: "CS-EQP-GLV-L", name: "Sarung Tangan Nitril Food Grade Ukuran L (100 Pcs)", description: "Powder-free black nitrile food handling gloves size L", cat: "CONSUMABLE_CAFE", type: "CONSUMABLE", supply: "BUY", uom: "BOX", cost: "75000", rop: "10", safety: "3", leadDays: 2, moq: "10", lotSize: "5", initialStock: "25", initialWh: "RAW" },
    { sku: "CS-EQP-PAP-BAK", name: "Kertas Baking Parchment Silikon Roll 30cm x 100m", description: "Heavy duty non-stick silicone parchment roll untuk oven", cat: "CONSUMABLE_CAFE", type: "CONSUMABLE", supply: "BUY", uom: "ROLL", cost: "120000", rop: "10", safety: "3", leadDays: 3, moq: "6", lotSize: "3", initialStock: "25", initialWh: "RAW" },
    { sku: "CS-EQP-PAP-POS", name: "Kertas Thermal Struk Kasir POS 80x80mm (Pack 10 Roll)", description: "BPA-free thermal receipt roll pack isi 10 roll", cat: "CONSUMABLE_CAFE", type: "CONSUMABLE", supply: "BUY", uom: "PACK", cost: "65000", rop: "20", safety: "5", leadDays: 2, moq: "10", lotSize: "5", initialStock: "45", initialWh: "RAW" },
    { sku: "CS-EQP-BAG-TRH", name: "Plastik Sampah Hitam Tebal Tugas Berat 100L (Pack 50)", description: "Heavy duty black trash liner 100 liter pack isi 50 lembar", cat: "CONSUMABLE_CAFE", type: "CONSUMABLE", supply: "BUY", uom: "PACK", cost: "45000", rop: "15", safety: "5", leadDays: 2, moq: "10", lotSize: "5", initialStock: "35", initialWh: "RAW" },
    { sku: "CS-EQP-FIL-WAT", name: "Filter Cartridge Penyaring Air Mesin Kopi BWT", description: "Magnesium mineralized water filter cartridge untuk espresso", cat: "CONSUMABLE_CAFE", type: "CONSUMABLE", supply: "BUY", uom: "PCS", cost: "1850000", rop: "2", safety: "1", leadDays: 7, moq: "2", lotSize: "1", initialStock: "4", initialWh: "RAW" },
  ];

  console.log(`Creating ${itemsList.length} items in database...`);
  const itemMap = new Map<string, string>();

  for (const item of itemsList) {
    const created = await prisma.item.create({
      data: {
        sku: item.sku,
        name: item.name,
        description: item.description,
        categoryId: catMap.get(item.cat)!,
        itemType: item.type,
        supplyType: item.supply,
        baseUomId: uomMap.get(item.uom)!,
        standardMaterialCost: D(item.cost),
        reorderPoint: D(item.rop),
        safetyStock: D(item.safety),
        purchasingLeadDays: item.leadDays,
        minimumOrderQty: D(item.moq),
        lotSizeMultiple: D(item.lotSize),
        status: "ACTIVE",
      },
    });
    itemMap.set(item.sku, created.id);

    // Initial stock balance if specified
    if (item.initialStock && Number(item.initialStock) > 0) {
      const whId = item.initialWh === "FG" ? whFg.id : whRaw.id;
      const onHandQty = D(item.initialStock);
      const unitCost = D(item.cost);
      const totalVal = D(new Decimal(item.initialStock).times(new Decimal(item.cost)).toString());

      await prisma.stockBalance.create({
        data: {
          itemId: created.id,
          warehouseId: whId,
          onHand: onHandQty,
          reserved: D("0"),
          blocked: D("0"),
          onHandValue: totalVal,
          averageUnitCost: unitCost,
          valuationComplete: true,
        },
      });
    }
  }

  // 10. Multi-Level BOMs (Created as DRAFT, lines added, then APPROVED)
  console.log("📜 Creating Multi-Level Cafe BOMs...");

  type BomSeed = {
    number: string;
    outputSku: string;
    outputQty: string;
    lines: Array<{
      componentSku: string;
      qty: string;
      uom: string;
      scrap: string;
      notes: string;
    }>;
  };

  const bomsList: BomSeed[] = [
    // BOM 1: House Blend Roasted Coffee 1 KG (From Green Beans)
    {
      number: "BOM-ROAST-HOUSE-1KG",
      outputSku: "SA-ROA-ESPR-HOU",
      outputQty: "1",
      lines: [
        { componentSku: "RM-GRN-GAYO", qty: "0.85", uom: "KG", scrap: "0.15", notes: "Arabica component 70% yield (15% moisture loss)" },
        { componentSku: "RM-GRN-ROB-DAMP", qty: "0.36", uom: "KG", scrap: "0.15", notes: "Robusta component 30% yield (15% moisture loss)" },
      ],
    },
    // BOM 2: Homemade Aren Syrup Base 1 Liter
    {
      number: "BOM-EXT-AREN-1L",
      outputSku: "SA-EXT-AREN-SYR",
      outputQty: "1",
      lines: [
        { componentSku: "RM-SYR-AREN-LIQ", qty: "0.85", uom: "L", scrap: "0.02", notes: "Organic liquid palm sugar" },
        { componentSku: "RM-SYR-AREN-SOL", qty: "0.20", uom: "KG", scrap: "0.01", notes: "Melted solid aren for density & aroma" },
      ],
    },
    // BOM 3: Cold Brew Concentrate 1 Liter
    {
      number: "BOM-EXT-CB-1L",
      outputSku: "SA-EXT-CLD-BREW",
      outputQty: "1",
      lines: [
        { componentSku: "SA-ROA-CB-CRSE", qty: "0.25", uom: "KG", scrap: "0.05", notes: "Coarse ground roast coffee" },
        { componentSku: "PC-FLT-COLD-BRW", qty: "0.02", uom: "PCS", scrap: "0", notes: "Shared commercial brew bag amortization" },
      ],
    },
    // BOM 4: Kopi Susu Aren Botol 250ml
    {
      number: "BOM-FG-LATTE-250ML",
      outputSku: "FG-RTD-LATTE-250",
      outputQty: "1",
      lines: [
        { componentSku: "SA-ROA-ESPR-HOU", qty: "0.022", uom: "KG", scrap: "0.02", notes: "22g double shot espresso beans" },
        { componentSku: "RM-DRY-MILK-PAS", qty: "0.160", uom: "L", scrap: "0.01", notes: "Pasteurized fresh milk" },
        { componentSku: "SA-EXT-AREN-SYR", qty: "0.035", uom: "L", scrap: "0.01", notes: "Homemade pandan aren syrup" },
        { componentSku: "PC-BTL-GLS-250", qty: "1", uom: "PCS", scrap: "0.01", notes: "Amber glass bottle 250ml" },
        { componentSku: "PC-CAP-ALU-28", qty: "1", uom: "PCS", scrap: "0.01", notes: "Black aluminum cap 28mm" },
        { componentSku: "PC-LBL-BOT-LAT", qty: "1", uom: "PCS", scrap: "0.02", notes: "Waterproof vinyl bottle label" },
      ],
    },
    // BOM 5: Kopi Susu Aren Botol 1 Liter
    {
      number: "BOM-FG-LATTE-1000ML",
      outputSku: "FG-RTD-LATTE-1L",
      outputQty: "1",
      lines: [
        { componentSku: "SA-ROA-ESPR-HOU", qty: "0.088", uom: "KG", scrap: "0.02", notes: "88g espresso beans extraction" },
        { componentSku: "RM-DRY-MILK-PAS", qty: "0.640", uom: "L", scrap: "0.01", notes: "Fresh milk 640ml" },
        { componentSku: "SA-EXT-AREN-SYR", qty: "0.140", uom: "L", scrap: "0.01", notes: "Homemade aren syrup 140ml" },
        { componentSku: "PC-BTL-PET-1000", qty: "1", uom: "PCS", scrap: "0.01", notes: "PET mini-jerrycan 1000ml" },
        { componentSku: "PC-CAP-PLS-28", qty: "1", uom: "PCS", scrap: "0.01", notes: "Tamper evident plastic cap" },
        { componentSku: "PC-LBL-BOT-1L", qty: "1", uom: "PCS", scrap: "0.02", notes: "Vinyl front/back label 1L" },
      ],
    },
    // BOM 6: Cold Brew Oat Milk Latte Botol 250ml
    {
      number: "BOM-FG-CBOAT-250ML",
      outputSku: "FG-RTD-CBOAT-250",
      outputQty: "1",
      lines: [
        { componentSku: "SA-EXT-CLD-BREW", qty: "0.100", uom: "L", scrap: "0.01", notes: "Cold brew concentrate 100ml" },
        { componentSku: "RM-DRY-MILK-OAT", qty: "0.125", uom: "L", scrap: "0.01", notes: "Barista edition oat milk" },
        { componentSku: "SA-EXT-SIMP-SYR", qty: "0.025", uom: "L", scrap: "0.01", notes: "Simple syrup sweetener" },
        { componentSku: "PC-BTL-GLS-250", qty: "1", uom: "PCS", scrap: "0.01", notes: "Amber glass bottle 250ml" },
        { componentSku: "PC-CAP-ALU-28", qty: "1", uom: "PCS", scrap: "0.01", notes: "Aluminum screw cap" },
        { componentSku: "PC-LBL-BOT-OAT", qty: "1", uom: "PCS", scrap: "0.02", notes: "Oat latte vinyl label" },
      ],
    },
    // BOM 7: Croissant Laminated Dough Sheet 1 KG
    {
      number: "BOM-SA-CROISSANT-1KG",
      outputSku: "SA-BAK-CRS-DGH",
      outputQty: "1",
      lines: [
        { componentSku: "RM-BAK-FLR-HI", qty: "0.55", uom: "KG", scrap: "0.02", notes: "Bread flour 550g" },
        { componentSku: "RM-FAT-BUT-SHT", qty: "0.35", uom: "KG", scrap: "0.02", notes: "French butter tournage sheet 350g" },
        { componentSku: "RM-DRY-MILK-PAS", qty: "0.12", uom: "L", scrap: "0.01", notes: "Liquid milk 120ml" },
        { componentSku: "RM-SYR-SUGAR-W", qty: "0.04", uom: "KG", scrap: "0.01", notes: "Fine sugar 40g" },
        { componentSku: "RM-BAK-YEAST-D", qty: "0.015", uom: "KG", scrap: "0.01", notes: "Dry yeast 15g" },
        { componentSku: "RM-BAK-SALT-SEA", qty: "0.010", uom: "KG", scrap: "0.01", notes: "Sea salt 10g" },
      ],
    },
    // BOM 8: Classic French Butter Croissant 1 PCS
    {
      number: "BOM-FG-CROISSANT",
      outputSku: "FG-BAK-CRS-BUT",
      outputQty: "1",
      lines: [
        { componentSku: "SA-BAK-CRS-DGH", qty: "0.085", uom: "KG", scrap: "0.02", notes: "Cut dough triangle 85g" },
        { componentSku: "RM-FAT-EGG-FRE", qty: "0.012", uom: "KG", scrap: "0.02", notes: "Egg wash glaze" },
        { componentSku: "PC-PPR-WAX-SHT", qty: "1", uom: "PCS", scrap: "0", notes: "Baking wax paper liner" },
      ],
    },
    // BOM 9: Pain au Chocolat 1 PCS
    {
      number: "BOM-FG-PAIN-CHOCO",
      outputSku: "FG-BAK-CRS-CHO",
      outputQty: "1",
      lines: [
        { componentSku: "SA-BAK-CRS-DGH", qty: "0.085", uom: "KG", scrap: "0.02", notes: "Dough rectangle 85g" },
        { componentSku: "RM-CHO-BAT-DRK", qty: "0.024", uom: "KG", scrap: "0.01", notes: "2x dark chocolate batons" },
        { componentSku: "RM-FAT-EGG-FRE", qty: "0.012", uom: "KG", scrap: "0.02", notes: "Egg wash glaze" },
        { componentSku: "PC-PPR-WAX-SHT", qty: "1", uom: "PCS", scrap: "0", notes: "Wax paper serving liner" },
      ],
    },
    // BOM 10: Drip Bag Coffee Box (5 Sachet)
    {
      number: "BOM-FG-DRIPBAG-BOX",
      outputSku: "FG-RET-DRIP-HOU",
      outputQty: "1",
      lines: [
        { componentSku: "SA-ROA-DRIP-GRD", qty: "0.060", uom: "KG", scrap: "0.02", notes: "60g ground coffee (12g x 5 sachet)" },
        { componentSku: "PC-FLT-DRIP-BAG", qty: "5", uom: "PCS", scrap: "0.02", notes: "5x Japanese filter drip bags" },
        { componentSku: "PC-BOX-DRIP-OUT", qty: "1", uom: "PCS", scrap: "0.01", notes: "Printed outer cardboard box" },
        { componentSku: "PC-LBL-DRIP-BX", qty: "1", uom: "PCS", scrap: "0.01", notes: "Security label seal" },
      ],
    },
  ];

  for (const bomDef of bomsList) {
    const outputItemId = itemMap.get(bomDef.outputSku);
    if (!outputItemId) {
      console.warn(`Output item not found for BOM: ${bomDef.outputSku}`);
      continue;
    }

    // 1. Create BOM in DRAFT status
    const createdBom = await prisma.bom.create({
      data: {
        number: bomDef.number,
        outputItemId,
        revision: "1.0",
        outputQty: D(bomDef.outputQty),
        status: "DRAFT",
        effectiveDate: new Date("2026-01-01T00:00:00Z"),
        createdById: adminUser.id,
      },
    });

    // 2. Insert BOM lines while DRAFT
    const linesToInsert = bomDef.lines.map((line, idx) => ({
      bomId: createdBom.id,
      componentId: itemMap.get(line.componentSku)!,
      quantity: D(line.qty),
      uomId: uomMap.get(line.uom)!,
      scrapRate: D(line.scrap),
      sequence: idx + 1,
      notes: line.notes,
    }));

    await prisma.bomLine.createMany({
      data: linesToInsert,
    });

    // 3. Approve BOM
    await prisma.bom.update({
      where: { id: createdBom.id },
      data: {
        status: "APPROVED",
        approvedById: adminUser.id,
        approvedAt: new Date("2026-01-01T00:00:00Z"),
      },
    });
  }

  console.log("✅ Cafe & Coffee Roastery ERP Seeding Completed Successfully!");
  console.log(`   - Total Items Seeded: ${itemsList.length}`);
  console.log(`   - Total Categories: ${categoriesData.length}`);
  console.log(`   - Total UOMs: ${uomsData.length}`);
  console.log(`   - Total Warehouses: 3 (Raw, WIP, Finished Goods)`);
  console.log(`   - Total Work Centers: 4 (Roastery, Extraction, Bottling, Bakery)`);
  console.log(`   - Total Approved BOMs: ${bomsList.length}`);
}

main()
  .catch((err) => {
    console.error("❌ Seeding failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
