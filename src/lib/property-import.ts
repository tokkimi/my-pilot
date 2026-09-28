import {newListing} from './seed'
import type {Listing} from './types'
export function mapProperty(row:Record<string,unknown>,owner:string,source:string,existing?:Listing):Listing{
 const externalId=String(row.ListingKey??row.externalId??'').trim()
 if(!externalId||externalId.length>200)throw new Error('ListingKey / externalId requis (200 caractères maximum).')
 const address=String(row.UnparsedAddress??row.address??'').trim()
 if(!address&&!existing)throw new Error('Adresse requise.')
 const item=newListing(owner,existing||{})
 const strings={address:'UnparsedAddress',city:'City',centris:'ListingId',propertyType:'PropertyType',livingArea:'LivingArea',lot:'LotSizeArea',intInfo:'PublicRemarks'} as const
 for(const [target,origin] of Object.entries(strings)){const value=row[origin]??row[target];if(value!==undefined)(item as unknown as Record<string,unknown>)[target]=String(value).slice(0,20000)}
 const numbers={price:'ListPrice',bedrooms:'BedroomsTotal',bathrooms:'BathroomsTotalInteger',yearBuilt:'YearBuilt'} as const
 for(const [target,origin] of Object.entries(numbers)){const value=row[origin]??row[target];if(value!==undefined){const n=Number(value);if(!Number.isFinite(n)||n<0)throw new Error(target+' invalide.');(item as unknown as Record<string,unknown>)[target]=n}}
 const statuses:Record<string,Listing['status']>={Active:'active',Pending:'pa_acceptee',Closed:'vendu',Expired:'expire',Withdrawn:'retire',ComingSoon:'preparation'}
 if(row.StandardStatus!==undefined){const status=statuses[String(row.StandardStatus)];if(!status)throw new Error('Statut source non reconnu : '+row.StandardStatus);item.status=status}
 const photo=row.photoUrl;if(photo!==undefined){const url=new URL(String(photo));if(url.protocol!=='https:')throw new Error('Photo HTTPS requise.');item.photoUrl=url.href}
 item.external={source,id:externalId,syncedAt:new Date().toISOString()}
 return item
}
