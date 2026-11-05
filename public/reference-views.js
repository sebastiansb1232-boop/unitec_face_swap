/* Una identidad con hasta tres vistas autorizadas. Las fotos permanecen en memoria. */
(function(root){
  'use strict';
  const Pose=root.FacePose||(typeof require==='function'?require('./face-pose'):null);
  class ReferenceViews{
    constructor(){this.version=0;this.entries=new Map();this.colorLocked=true;this.tones=new WeakMap();this.prepared=new WeakMap();}
    setColorLocked(value){this.colorLocked=!!value;this.version++;return this.attach();}
    setFront(reference){this.entries.clear();this.entries.set('front',reference);this.version++;return this.attach();}
    add(side,reference){
      if(!['left','right'].includes(side))throw new Error('Vista desconocida.');
      if(!this.entries.has('front'))throw new Error('Primero carga una fotografía frontal.');
      const error=Pose.validateView(reference.points,reference.image.width,side);if(error)throw new Error(error);
      const other=this.entries.get(side==='left'?'right':'left');
      if(other&&Math.sign(Pose.basis(other.points,other.image.width).yaw)===Math.sign(Pose.basis(reference.points,reference.image.width).yaw))throw new Error('Los dos perfiles miran hacia el mismo lado. Utiliza una foto del lado opuesto.');
      this.entries.set(side,reference);this.version++;return this.attach();
    }
    remove(side){if(side==='front')return;this.entries.delete(side);this.version++;return this.attach();}
    attach(){
      const front=this.entries.get('front');if(!front)return null;
      const tone=r=>{if(!this.tones.has(r))this.tones.set(r,root.ReferenceTone?.sample(r.image,r.points)||null);return this.tones.get(r);};
      const target=this.colorLocked?tone(front):null,prepared=r=>{const previous=this.prepared.get(r);if(previous?.target===target&&previous?.matte===r.renderImage)return previous;const image=root.ReferenceTone?.balance(r.image,r.points,target,tone(r))||r.image,renderImage=r.renderImage?(root.ReferenceTone?.balance(r.renderImage,r.points,target,tone(r))||r.renderImage):image;const value={target,image,renderImage,matte:r.renderImage};this.prepared.set(r,value);return value;};
      const views=[...this.entries].map(([side,r])=>{const v=prepared(r);return {side,image:v.image,renderImage:v.renderImage,points:r.points,width:r.image.width,tone:target||tone(r)};});
      // Un objeto nuevo invalida el token anterior una sola vez, nunca al girar.
      this.reference={...front,uid:'views-'+this.version,views,toneTarget:target};return this.reference;
    }
    get count(){return this.entries.size;}
  }
  root.ReferenceViews=ReferenceViews;if(typeof module!=='undefined')module.exports={ReferenceViews};
})(typeof window!=='undefined'?window:globalThis);
