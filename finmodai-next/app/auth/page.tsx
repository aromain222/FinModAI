import { redirect } from "next/navigation";

export default function AuthEntry() {
  redirect("/login");
}
