import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-4 py-24 text-center">
      <div className="font-serif text-6xl font-bold text-clan-red dark:text-clan-gold">404</div>
      <h1 className="mt-4 font-serif text-2xl font-bold">Không tìm thấy trang</h1>
      <p className="mt-2 text-clan-brown/70 dark:text-clan-cream/60">
        Trang hoặc thành viên bạn tìm không tồn tại trong gia phả.
      </p>
      <Link href="/" className="mt-6">
        <Button>Về trang chủ</Button>
      </Link>
    </div>
  );
}
