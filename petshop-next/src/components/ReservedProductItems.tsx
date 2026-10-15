type Item={quantity:number;unitPrice:{toString():string};product:{productName:string}};
export default function ReservedProductItems({items}:{items:Item[]}){
 const money=(n:number)=>new Intl.NumberFormat('en-PH',{style:'currency',currency:'PHP'}).format(n);
 return <ul className="reservedProductItems">{items.map((item,index)=><li key={index}><b>{item.product.productName}</b><span>{item.quantity} × {money(Number(item.unitPrice.toString()))}</span><strong>{money(Math.round(Number(item.unitPrice.toString())*100)*item.quantity/100)}</strong></li>)}</ul>;
}
