import { useSmoothScroll } from "@/lib/smoothScroll";
import Footer from "./landing/Footer";
import Guardrails from "./landing/Guardrails";
import Header from "./landing/Header";
import Hero from "./landing/Hero";
import HowItWorks from "./landing/HowItWorks";
import Product from "./landing/Product";
import Roadmap from "./landing/Roadmap";
import Workloads from "./landing/Workloads";

export default function Landing() {
  useSmoothScroll();

  return (
    <div className="w-full bg-black">
      <Header />
      <Hero />
      <Product />
      <Guardrails />
      <HowItWorks />
      <Workloads />
      <Roadmap />
      <Footer />
    </div>
  );
}
