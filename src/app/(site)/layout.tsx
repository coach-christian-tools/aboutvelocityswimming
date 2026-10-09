import styles from "../marketing.module.css";
import { scopedClasses } from "@/lib/styles";
export default function SiteLayout({ children }: { children: React.ReactNode }) { return <div className={scopedClasses(styles,"marketing-site")}>{children}</div>; }
