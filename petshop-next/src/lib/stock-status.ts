export function stockStatus(quantity:number,threshold:number){
  return quantity<=0?{label:"Out of Stock",tone:"out"}:quantity<=threshold?{label:"Low Stock",tone:"low"}:{label:"In Stock",tone:"in"};
}