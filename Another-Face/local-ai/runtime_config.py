"""Plan de aceleración; la sesión comprueba después qué proveedor pudo cargar."""
def provider_plan(available, requested='auto', device=0):
    names={'cuda':'CUDAExecutionProvider','dml':'DmlExecutionProvider','cpu':'CPUExecutionProvider'}
    if requested not in {'auto',*names}:
        raise ValueError('ANOTHERFACE_PROVIDER debe ser auto, cuda, dml o cpu.')
    device=int(device)
    if device<0:raise ValueError('ANOTHERFACE_GPU_DEVICE debe ser un entero mayor o igual a cero.')
    order=['cuda','dml','cpu'] if requested=='auto' else [requested,'cpu']
    result=[]
    for key in dict.fromkeys(order):
        name=names[key]
        if name in available:result.append((name,{} if key=='cpu' else {'device_id':str(device)}))
    if not result:raise RuntimeError('No hay un proveedor ONNX compatible instalado.')
    return result
