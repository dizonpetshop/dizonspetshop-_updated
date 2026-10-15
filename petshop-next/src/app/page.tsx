import HomeProducts from "@/components/HomeProducts";
import HomeDogCarousel from "@/components/HomeDogCarousel";
import AdminIcon from "@/components/AdminIcon";
import Link from "next/link";
import PublicHeader from "@/components/PublicHeader";
import ContactFooter from "@/components/ContactFooter";
import { prisma } from "@/lib/prisma";
import { productImageUrl } from "@/lib/product-image";

export const dynamic = "force-dynamic";

const money = (value: { toString(): string }) => new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(Number(value.toString()));

export default async function Home() {
  const products = await prisma.product.findMany({ where: { isActive: 1 }, select: { productId: true, productName: true, category: true, productGroup: true, price: true, stockQuantity: true, isActive: true, description: true }, orderBy: [{ productGroup: "asc" }, { productName: "asc" }] }).then((rows) => rows.map((row) => ({ ...row, image: productImageUrl(row.productId) }))).catch((error) => {
    console.error("[homepage] products query failed", error);
    return [];
  });
  const [prices, groomers] = await Promise.all([
    prisma.styleSizePricing.findMany({ include: { style: true }, orderBy: [{ styleId: "asc" }, { pricingId: "asc" }] }).catch(() => []),
    prisma.groomer.findMany({ where: { isActive: 1 }, orderBy: { groomerName: "asc" } }).catch(() => []),
  ]);
  const styles = [...new Map(prices.map((item) => [item.styleId, item.style])).values()];

  return (
    <div className="homePage homeLandingPage">
      <PublicHeader />
      <main className="landing">
        <section className="hero heroWithDogs"><div className="heroInner"><div className="heroText"><h1>Welcome to Dizon’s Pet Grooming</h1><p>Fresh Cuts, Happy Paws!</p></div><HomeDogCarousel/></div></section>


        <section className="catalogSection groomingPricing" id="grooming">
          <div className="section">
            <div className="sectionHeading"><span className="eyebrow">GROOMING SERVICES</span><h2>Styles and prices for every size.</h2><p>Choose an available specialist—{groomers.map((item) => item.groomerName).join(" or ") || "our grooming team"}—then reserve salon or home service from your client account.</p></div>
            <div className="publicGroomingGrid">{styles.map((style, index) => <article className={`groomingPriceCard ${style.styleName === "Bear Cut" ? "isFeatured" : ""}`} key={style.styleId}>
              {style.styleName === "Bear Cut" && <span className="groomingFeatureLabel">FEATURED STYLE</span>}
              <span className={`groomingPriceIcon iconTone${index % 5}`} aria-hidden="true">{style.styleName === "Puppy Cut" ? <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M12 21 3.5 12.5a5.5 5.5 0 0 1 8.5-7 5.5 5.5 0 0 1 8.5 7Z"/></svg> : <AdminIcon name={style.styleName === "Bear Cut" ? "paw" : style.styleName === "Summer Cut" ? "settings" : style.styleName === "Asian Fusion" ? "scissors" : "categories"} size={18}/>}</span>
              <h3>{style.styleName}</h3>
              <div className="groomingPriceRows">{prices.filter((price) => price.styleId === style.styleId).map((price) => <p key={price.pricingId}><span>{price.petSize}</span><b>{money(price.price)}</b></p>)}</div>
            </article>)}</div>
            {!styles.length && <div className="dashboardEmpty"><b>Grooming prices are temporarily unavailable</b><small>Please contact the shop for current services and pricing.</small></div>}
            <div className="catalogAction"><Link className="primaryButton" href="/client/login">Book grooming</Link></div>
          </div>
        </section>

        <section className="homeRetailSection" id="products"><div className="section"><div className="sectionHeading"><span className="eyebrow">RETAIL ESSENTIALS</span><h2>Food, shampoo, and trusted care<br className="homeRetailBreak"/> products.</h2><p>Reserve available cat and dog essentials online, choose Cash, GCash, or Maya, then complete payment and pickup at the physical store.</p></div>{products.length ? <HomeProducts products={products.map(product=>({id:product.productId,name:product.productName,category:product.category,group:product.productGroup,description:product.description,price:Number(product.price),stock:product.stockQuantity,image:product.image}))}/> : <div className="dashboardEmpty"><b>Catalog temporarily unavailable</b><small>Please check back for current store inventory.</small></div>}</div></section>


        <section className="section experience" id="about"><div className="experienceVisual homeAboutPhoto"><img src="/assets/dizon.jpg" alt="Dizon with a groomed dog" loading="lazy"/></div><div className="experienceCopy"><span className="eyebrow">About Dizon&apos;s Pet Grooming</span><h2>We specialize in dog and cat grooming with a unique Asian Fusion expertise.</h2><p className="homeEstablished">Established in 2024</p></div></section>

      </main>
      <ContactFooter />
    </div>
  );
}
