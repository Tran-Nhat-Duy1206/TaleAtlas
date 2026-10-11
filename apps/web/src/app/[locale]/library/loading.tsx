import styles from "@/components/library/library.module.css";
export default function LibraryLoading() {
  return (
    <section className={styles.library}>
      <p role="status">Loading / Đang tải…</p>
    </section>
  );
}
