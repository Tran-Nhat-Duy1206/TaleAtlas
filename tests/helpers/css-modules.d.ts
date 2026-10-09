// Test compilation imports real client editors; mirror Next's CSS module type
// without depending on generated .next files in a clean CI checkout.
declare module "*.module.css" {
  const classes: { readonly [className: string]: string };
  export default classes;
}
